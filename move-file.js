module.exports = function (args) {
  const fs = require('fs')
  const path = require('path')
  const tmpDir = 'tmp'
  const rimraf = require('rimraf')
  const sftsHost =
    args.options['sfts-host'] ||
    process.env.SFTS_HOST ||
    'filetransfer.gov.bc.ca'
  const sftsUser = args.options['sfts-user'] || process.env.SFTS_USER
  const sftsPassword =
    args.options['sfts-password'] || process.env.SFTS_PASSWORD
  const sftsFolder =
    args.options['sfts-folder'] || process.env.SFTS_FOLDER || '/'
  const s3Bucket = args.options['s3-bucket'] || process.env.S3_BUCKET
  const s3PathPrefix =
    args.options['s3-path-prefix'] || process.env.S3_PATH_PREFIX
  const awsAccessKeyId =
    args.options['aws-access-key-id'] || process.env.AWS_ACCESS_KEY_ID
  const awsSecretAccessKey =
    args.options['aws-secret-access-key'] || process.env.AWS_SECRET_ACCESS_KEY
  const concurrency =
    args.options['concurrency'] || process.env.CONCURRENCY || 10
  const queue = require('async/queue')

  const AWS = require('aws-sdk')
  AWS.config.update({
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  })
  const s3 = new AWS.S3({
    apiVersion: '2019-11-13',
  })

  const { spawn } = require('child_process')

  async function goToSftsFolder() {
    return new Promise((resolve, reject) => {
      const xfer = spawn(
        'java',
        [
          '-classpath',
          `${path.join(__dirname, 'xfer', 'xfer.jar')}${
            path.delimiter
          }${path.join(__dirname, 'xfer', 'jna.jar')}`,
          'xfer',
          `-user:${sftsUser}`,
          `-password:${sftsPassword}`,
          sftsHost,
        ],
        { cwd: path.join(__dirname, tmpDir) }
      )
      xfer.stdin.setEncoding('utf-8')
      xfer.stdout.setEncoding('utf-8')
      let output = ''
      xfer.stdout.on('readable', () => {
        while ((data = xfer.stdout.read())) {
          output += data
        }
        if (!output.endsWith('> ')) return
        if (!output.startsWith(`User ${sftsUser} signed on`)) {
          reject('login failed')
        }
        xfer.stdout.removeAllListeners('readable')
        xfer.stdin.write(`cd ${sftsFolder}` + '\n')
        output = ''
        xfer.stdout.on('readable', () => {
          while ((data = xfer.stdout.read())) {
            output += data
          }
          if (!output.endsWith('> ')) return
          xfer.stdout.removeAllListeners('readable')
          xfer.stderr.removeAllListeners('data')
          resolve(xfer)
        })
      })
      xfer.stderr.once('data', (data) => {
        reject(data)
      })
    })
  }

  function processFile(operation) {
    return new Promise(async (resolve, reject) => {
      try {
        const xfer = await goToSftsFolder()
        let output = ''
        xfer.stdin.write(operation + '\n')
        xfer.stdout.on('readable', () => {
          while ((data = xfer.stdout.read())) {
            output += data
          }
          if (!output.endsWith('> ')) return
          xfer.stdout.removeAllListeners('readable')
          xfer.stdin.end('quit\n')
        })
        xfer.stderr.once('data', (data) => {
          reject(data)
        })
        xfer.on('close', (code) => {
          if (code !== 0) {
            return reject(code)
          }
          resolve(output)
        })
      } catch (ex) {
        reject(ex)
      }
    })
  }

  return async function () {
    console.info('started processing')
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir)
      }
      let files = await processFile('ls')
      files = files.split('\n').slice(0, -1)
      if (files.length > 0) {
        files = files.reduce((v, e) => ((v[e.trim()] = {}), v), {})
      }
      for (const fn of Object.keys(files)) {
        try {
          await processFile(`get ${fn}`)
          if (!fs.existsSync(path.join(__dirname, tmpDir, fn))) {
            throw new Error('download failed')
          }
          console.info(`file ${fn} downloaded`)
        } catch (ex) {
          console.error(`file ${fn} download failed`)
          files[fn].downloaded = false
        }
      }
      const q = queue((file, cb) => {
        s3.upload(
          {
            Bucket: s3Bucket,
            Key: s3PathPrefix + `/${file}`,
            Body: fs.createReadStream(path.join(__dirname, tmpDir, file)),
          },
          function (err, data) {
            if (err) {
              files[file].uploaded = false
              console.error(`error uploading file ${file}: ${err}`)
              return cb(err)
            }
            console.info(`uploaded file ${file}`)
            return cb()
          }
        )
      }, concurrency)
      q.drain(async () => {
        for (const fn of Object.keys(files)) {
          try {
            if (
              files[fn].downloaded !== false &&
              files[fn].uploaded !== false
            ) {
              await processFile(`delete ${fn}`)
              console.info(`file ${fn} deleted`)
            }
          } catch (ex) {
            console.error(`file ${fn} deletion failed`)
          }
        }
        // delete the files in tmpDir
        rimraf.sync(path.join(__dirname, tmpDir))
        console.info('finished processing')
      })
      const downloadedFiles = Object.keys(files).reduce((a, v) => {
        if (files[v].downloaded !== false) {
          a.push(v)
        }
        return a
      }, [])
      q.push(downloadedFiles)
    } catch (ex) {
      console.error(`error transfering files: ${ex}`)
    }
  }
}

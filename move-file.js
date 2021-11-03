module.exports = function (args) {
  const fs = require('fs')
  const path = require('path')
  const tmpDir = 'tmp'
  const rimraf = require('rimraf')
  let noClobber = true
  if (args.options['no-clobber'] === 'false' || process.env.NO_CLOBBER === 'false'){
    noClobber = false
  }
  const sftsHost =
    args.options['sfts-host'] ||
    process.env.SFTS_HOST ||
    'filetransfer.gov.bc.ca'
  const sftsUser =
    args.options['sfts-user'] || process.env.SFTS_USER
  const sftsPassword =
    args.options['sfts-password'] || process.env.SFTS_PASSWORD
  const sftsFolder =
    args.options['sfts-folder'] || process.env.SFTS_FOLDER || '/'
  const s3Bucket =
    args.options['s3-bucket'] || process.env.S3_BUCKET
  const s3PathPrefix =
    args.options['s3-path-prefix'] || process.env.S3_PATH_PREFIX
  const awsAccessKeyId =
    args.options['aws-access-key-id'] || process.env.AWS_ACCESS_KEY_ID
  const awsSecretAccessKey =
    args.options['aws-secret-access-key'] || process.env.AWS_SECRET_ACCESS_KEY
  const concurrency =
    args.options['concurrency'] || process.env.CONCURRENCY || 10
  const mode = args.options['mode'] || process.env.MODE || 'mv'
  const mv = ( mode === 'mv' )
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

  // Processes an operation against a file through MOVEit XFer
  // The list of possible operations is at:
  // https://docs.ipswitch.com/MOVEit/DMZ90/FreelyXfer/MOVEitXferManual.html#commands

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

  // Return a list of files in S3 under the prefix
  function s3FileList() {
    return new Promise(async (resolve, reject) => {
      try {
        s3.listObjectsV2(
          {
            Bucket: s3Bucket,
            Prefix: s3PathPrefix
          }, (err, data) => {
            if (err) { reject (err) }
            else {
              let files = []
              const regex = /[^/]+$/g;
              for (const o of data.Contents) {
                let fn = o.Key.match(regex)
                if (fn !== null && fn[0] !== ''){
                  files.push(fn[0])
                }
              }
              resolve(files) }
          }
        )
      }
      catch (ex) {
        reject(ex)
      }
    })
  }

  // Triggered by the call to moveFile() from index.js
  return async function () {
    // Fetch the files from SFTS
    console.info('started processing')
    try {
      // Create a temporary directory if it doesn't exist
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir)
      }
      // Store the string response of files in SFTS as a list
      let files = await processFile('ls')
      files = files.split('\n').slice(0, -1)

      if (noClobber) {
        // Store the list of files at the S3 folder
        let s3Files = await s3FileList()

        // Choose the files to move or copy from SFTS to S3
        files = files.filter(x => !s3Files.includes(x));
      }
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
        // Upload the file to s3 with the body of the file as a read stream
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
              // If a file upload fails, attempt to touch a file of the same prefixed with /bad
              s3.upload(
                {
                  Bucket: s3Bucket,
                  Key: s3PathPrefix + `/bad/${file}`,
                  Body: `Error transferring file : ${sftsFolder}${file}\n`
                      + `Triggered by SFTS user: ${sftsUser}\n`
                      + `Timestamp of error: ${Date()}.`
                },
                function (errBad, dataBad) {
                  if (errBad){
                    console.error(`error touching a reference to the `
                    + `file under the /bad path on S3: ${errBad}`)
                  }
                }
              )
              return cb(err)
            }
            console.info(`uploaded file ${file}`)
            return cb()
          }
        )
      }, concurrency)
      q.drain(async () => {
        // Only drain SFTS folder if the mode is set to `mv`
        if (mv) {
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

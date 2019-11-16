module.exports = function(args) {
  const fs = require("fs")
  const path = require("path")
  const tmpDir = "tmp"
  const rimraf = require("rimraf")
  const sftsHost =
    args.options["sfts-host"] ||
    process.env.SFTS_HOST ||
    "filetransfer.gov.bc.ca"
  const sftsUser = args.options["sfts-user"] || process.env.SFTS_USER
  const sftsPassword =
    args.options["sfts-password"] || process.env.SFTS_PASSWORD
  const sftsFolder = args.options["sfts-folder"] || process.env.SFTS_FOLDER||'/'
  const s3Bucket = args.options["s3-bucket"] || process.env.S3_BUCKET
  const s3PathPrefix =
    args.options["s3-path-prefix"] || process.env.S3_PATH_PREFIX
  const awsAccessKeyId =
    args.options["aws-access-key-id"] || process.env.AWS_ACCESS_KEY_ID
  const awsSecretAccessKey =
    args.options["aws-secret-access-key"] || process.env.AWS_SECRET_ACCESS_KEY
  const concurrency =
    args.options["concurrency"] || process.env.CONCURRENCY || 10
  const queue = require("async/queue")

  const AWS = require("aws-sdk")
  AWS.config.update({
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey
  })
  const s3 = new AWS.S3({
    apiVersion: "2019-11-13"
  })

  const { spawn } = require("child_process")

  const tmpDirRegex = new RegExp("^" + tmpDir + "/")
  let walkSync = function(dir, filelist) {
    let files = fs.readdirSync(dir)
    filelist = filelist || []
    files.forEach(function(file) {
      if (fs.statSync(path.join(dir, file)).isDirectory()) {
        filelist = walkSync(path.join(dir, file), filelist)
      } else {
        filelist.push(
          (dir.replace(/\\/g, "/") + "/").replace(tmpDirRegex, "") + file
        )
      }
    })
    return filelist
  }

  return async function() {
    console.info("started processing")
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir)
      }
      const xfer = spawn(
        "java",
        [
          "-classpath",
          `${path.join(__dirname, "xfer", "xfer.jar")}${
            path.delimiter
          }${path.join(__dirname, "xfer", "jna.jar")}`,
          "xfer",
          `-user:${sftsUser}`,
          `-password:${sftsPassword}`,
          sftsHost
        ],
        { cwd: path.join(__dirname, tmpDir) }
      )
      xfer.stdin.setEncoding("utf-8")
      xfer.stdout.once("data", data => {
        xfer.stdin.write(`cd ${sftsFolder}` + "\n")
        xfer.stdout.once("data", data => {
          xfer.stdin.write("prompt\n")
          xfer.stdout.once("data", data => {
            xfer.stdin.write("mget *\n")
            xfer.stdout.once("data", data => {
              xfer.stdin.end("quit\n")
            })
          })
        })
      })
      xfer.stderr.on("data", data => {
        throw new Error(data)
      })
      xfer.on("close", code => {
        if (code !== 0) {
          throw new Error(`xfer exit code ${code}`)
        }
        console.info("files downloaded")
        const q = queue((file, cb) => {
          s3.upload(
            {
              Bucket: s3Bucket,
              Key: s3PathPrefix + `/${file}`,
              Body: fs.createReadStream(path.join(__dirname, tmpDir, file))
            },
            function(err, data) {
              if (err) {
                console.error(`error uploading file ${file}: ${err}`)
                return cb(err)
              }
              console.info(`uploaded file ${file}`)
              return cb()
            }
          )
        }, concurrency)
        q.drain(() => {
          // delete the files in tmpDir
          rimraf.sync(path.join(__dirname, tmpDir))
          // delete the files in Sfts
          const xfer = spawn("java", [
            "-classpath",
            `${path.join(__dirname, "xfer", "xfer.jar")}${
              path.delimiter
            }${path.join(__dirname, "xfer", "jna.jar")}`,
            "xfer",
            `-user:${sftsUser}`,
            `-password:${sftsPassword}`,
            sftsHost
          ])
          xfer.stdin.setEncoding("utf-8")
          xfer.stdout.once("data", data => {
            xfer.stdin.write(`cd ${sftsFolder}` + "\n")
            xfer.stdout.once("data", data => {
              xfer.stdin.write("prompt\n")
              xfer.stdout.once("data", data => {
                xfer.stdin.write("mdelete *\n")
                xfer.stdout.once("data", data => {
                  xfer.stdin.end("quit\n")
                })
              })
            })
          })
          xfer.on("close", code => {
            if (code !== 0) {
              throw new Error("error delete files from sfts")
            }
            console.info("files deleted from source")
            console.info("finished processing")
          })
        })
        let files = []
        walkSync(tmpDir, files)
        q.push(files, err => {
          if (err) {
            throw new Error(err)
          }
        })
      })
    } catch (ex) {
      console.error(`error downloading files: ${ex}`)
    }
  }
}

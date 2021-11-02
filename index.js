const getOpt = require('node-getopt')
    .create([
        ['', 'run-on-init[=<string>]', 'run once on initialization (\'true\' or \'false\')'],
        ['m', 'mode=<string>', 'mode can be \'mv\' to move files or \'cp\' to copy files. Defaults to \'cp\''],
        ['n', 'no-clobber=<string>', 'Non clobbering copy mode (\'true\' or \'false\')'],
        ['s', 'sfts-host=<string>', 'SFTS host. Defaults to \'filetransfer.gov.bc.ca\''],
        ['u', 'sfts-user=<string>', 'SFTS login user name'],
        ['p', 'sfts-password=<string>', 'SFTS login password'],
        ['f', 'sfts-folder=<string>', 'SFTS folder. Defaults to \'/\''],
        ['b', 's3-bucket=<string>', 's3 bucket'],
        ['r', 's3-path-prefix=<string>', 's3 path prefix'],
        ['a', 'aws-access-key-id=<string>', 'aws access key id'],
        ['k', 'aws-secret-access-key=<string>', 'aws secret access key'],
        ['c', 'cron-time-spec=<string>', 'cron time spec'],
        ['z', 'cron-time-zone=<string>', 'cron time zone'],
        ['C', 'concurrency=<string>', 'concurrency'],
        ['h', 'help', 'display this help']
    ])
    .bindHelp(
        'Usage: node ' + process.argv[1] + ' [Options]\n[Options]:\n[[OPTIONS]]'
    )
const args = getOpt.parseSystem()
const moveFile = require('./move-file')(args)
const cronTimeSpec =
    args.options['cron-time-spec'] || process.env.CRON_TIME_SPEC
const cronTimeZone =
    args.options['cron-time-zone'] || process.env.CRON_TIME_ZONE
const runNow =
    args.options['run-on-init'] === 'true' || process.env.RUN_ON_INIT || false

// add timestamp to outputs
let log = console.log
console.log = function () {
    arguments[0] = new Date().toISOString() + ': ' + arguments[0]
    log.apply(console, arguments)
}
let error = console.error
console.error = function () {
    arguments[0] = new Date().toISOString() + ': ' + arguments[0]
    info.apply(console, arguments)
}
let info = console.info
console.info = function () {
    arguments[0] = new Date().toISOString() + ': ' + arguments[0]
    info.apply(console, arguments)
}

if (runNow) {
    console.info('run-on-init is set. Running once.')
    moveFile()
}
if (!cronTimeSpec) {
    console.info('no cron-time-spec, quitting.')
    return
}
console.info('configuring cron-time-spec:', cronTimeSpec)
const CronJob = require('cron').CronJob
new CronJob({
    cronTime: cronTimeSpec,
    onTick: moveFile,
    runOnInit: false,
    start: true,
    timeZone: cronTimeZone
})
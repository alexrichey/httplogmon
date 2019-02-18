var LogMonitor = require('./src/log_mon'),
    logMakerServer = require('./src/log_maker_server.js'),
    _ = require('lodash'),
    chalk = require('chalk'),
    clear = require('clear');


const LOG_FILE_PATH = process.env.LOG_FILE_PATH || '/tmp/access.log';
const REFRESH_LOOP_MS = parseInt(process.env.REFRESH_LOOP_MS) || 10 * 1000;
const LOG_CACHE_RETENTION_TIME_SECONDS = parseInt(process.env.LOG_CACHE_RETENTION_TIME_SECONDS) || 120;
const DISREGARD_LOG_TIMESTAMP = process.env.DISREGARD_LOG_TIMESTAMP || true;

var accessLogMonitor = new LogMonitor({
  logFilePath: LOG_FILE_PATH,
  logCacheRetentionTimeSeconds: LOG_CACHE_RETENTION_TIME_SECONDS,
  ignoreOldTimestampLogs: DISREGARD_LOG_TIMESTAMP
});

function printTrafficAlerts(logMonitor) {
  var trafficAlertsCopy = logMonitor.trafficAlerts.slice(0);
  var highTrafficAlerts = _.reverse(trafficAlertsCopy);
  return highTrafficAlerts.map(r => {
    if (r.type === logMonitor.BREACH_TYPE) {
      console.log(chalk.red(`High traffic generated an alert - hits = ${r.hits}, triggered at ${r.alert_time}`));
    } else {
      console.log(chalk.green(`Traffic levels have returned to normal, triggered at ${r.alert_time}`));
    }
  });
}
var startTime = new Date();
function redraw(logMonitor) {
  console.log(`HTTP MON!`);
  console.log(`uptime: ${((new Date()) - startTime)/1000}, total logs cached: ${accessLogMonitor.logs.length}, total log errors: ${logMonitor.errors.length}`);
  console.log(`Monitoring file at ${LOG_FILE_PATH}, refreshing every ${REFRESH_LOOP_MS / 1000} seconds, retaining cached logs for ${logMonitor.CACHED_LOG_RETENTION_SECONDS} seconds`);
  console.log(`\n\Top Sections!`);
  console.table(logMonitor.getTopUriSections());
  printTrafficAlerts(logMonitor);

  console.log('\n\nOverall Last 10 Requests');
  console.table(logMonitor.makeLastNRequestsList(10));
}


function refreshDisplayLoop() {
  clear(); // clear the console screen

  redraw(accessLogMonitor);
  accessLogMonitor.clearCachedStats();
  setTimeout(() => {refreshDisplayLoop();}, REFRESH_LOOP_MS);
}

accessLogMonitor.start();
refreshDisplayLoop();

if (process.env.RUN_LOG_MAKER_SERVER || true) {
  logMakerServer(LOG_FILE_PATH, parseInt(process.env.LOG_MAKER_SERVER_PORT));
}

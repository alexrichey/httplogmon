var LogMonitor = require('./src/log_mon'),
    logMakerServer = require('./src/log_maker_server.js'),
    _ = require('lodash'),
    clear = require('clear');

const LOG_FILE_PATH = process.env.LOG_FILE_PATH || '/tmp/access.log';
const LOG_COUNT_PER_SECOND_ALARM_THRESHOLD = parseInt(process.env.LOG_COUNT_PER_SECOND_ALARM_THRESHOLD) || 10;
const REFRESH_LOOP_MS = parseInt(process.env.REFRESH_LOOP_MS) || 10 * 1000; // 10 second default
const LOG_CACHE_RETENTION_TIME_SECONDS = parseInt(process.env.LOG_CACHE_RETENTION_TIME_SECONDS) || 120;
const DISREGARD_LOG_TIMESTAMP = process.env.DISREGARD_LOG_TIMESTAMP ? (process.env.DISREGARD_LOG_TIMESTAMP == 'true') : true;

const RUN_LOG_MAKER_SERVER = process.env.RUN_LOG_MAKER_SERVER ? (process.env.RUN_LOG_MAKER_SERVER == 'true') : true;
var logMakerServerRunning = false;
var serverPort = parseInt(process.env.LOG_MAKER_SERVER_PORT) || 3000;

/**
 * Prints the output the console using stats from a LogMonitor.
 * @param  {LogMonitor} logMonitor
 */
function redraw(logMonitor) {
  clear(); // clear the console screen
  console.log(`HTTP MON!`);
  console.log(`uptime: ${((new Date()) - logMonitor.startTime)/1000}, total logs cached: ${accessLogMonitor.logs.length}, total log errors: ${logMonitor.errors.length}, total logs per second: ${logMonitor.logsPerSecond}`);
  console.log(`Monitoring file at ${LOG_FILE_PATH}, refreshing every ${REFRESH_LOOP_MS / 1000} seconds, retaining cached logs for ${logMonitor.CACHED_LOG_RETENTION_SECONDS} seconds`);
  if (logMakerServerRunning) {
    console.log(`Running test server. Generate fake messages by POST'ing to localhost:${serverPort}/count=[n]\n`);
  }

  // print short term stats
  console.log(`\n\n-------------- Recent Traffic (${REFRESH_LOOP_MS / 1000} seconds) Stats --------------`);
  console.log(`Total Hits: ${accessLogMonitor.shortTermHitCount}`);
  console.log(`Top 5 Sections`);
  console.table(logMonitor.getTopUriSections(5));
  console.log(`Top 5 Remote Users by Hits`);
  console.table(logMonitor.getTopUsersHits(5));

  // print long term stats
  console.log(`\n\n-------------- Long Term (${logMonitor.CACHED_LOG_RETENTION_SECONDS} seconds) Traffic Stats --------------`);
  console.log(`Total Hits: ${accessLogMonitor.logs.length}`);
  logMonitor.printTrafficAlerts();
  console.log('\n\nOverall Last 10 Requests');
  console.table(logMonitor.makeLastNRequestsList(10));
}


// Start tailing the log file
var accessLogMonitor = new LogMonitor({
  logFilePath: LOG_FILE_PATH,
  logCacheRetentionTimeSeconds: LOG_CACHE_RETENTION_TIME_SECONDS,
  ignoreOldTimestampLogs: DISREGARD_LOG_TIMESTAMP,
  alarmLogCountThreshold: LOG_COUNT_PER_SECOND_ALARM_THRESHOLD
});
accessLogMonitor.start();


(function refreshDisplayLoop() {
  redraw(accessLogMonitor);
  accessLogMonitor.clearCachedStats();
  setTimeout(() => {refreshDisplayLoop();}, REFRESH_LOOP_MS);
})();


if (RUN_LOG_MAKER_SERVER) {
  logMakerServer(LOG_FILE_PATH, serverPort);
  logMakerServerRunning = true;
}

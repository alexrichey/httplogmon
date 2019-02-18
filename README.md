## HTTP Log Monitor

### Building, Running, and Testing
#### Build
npm install

#### Docker Build
docker build -t httplogmon .

#### Running on Node
###### Env Vars
`LOG_FILE_PATH`: Path to the logfile that the app will monitor. Defaults to `/tmp/access.log`

`REFRESH_LOOP_MS`: Rate (in Milliseconds) at which the app should refresh the display, and clear short term stats. If you want short term stats to persist longer, increase this value. Defaults to 10 seconds (10000)

`LOG_CACHE_RETENTION_TIME_SECONDS`: Duration (in seconds) for which long term stats are retained. IMPORTANT: this also determines the threshold alarms. The default is 2 minutes (120). For testing purposes, it can be useful to decrease this amount. For example, if you want to test Traffic Alert Recoveries, but don't want to wait a full 2 minutes, decrease this amount.

`RUN_LOG_MAKER_SERVER`: If you want to spam some logs into the configured file, you can run this little server, which will listen on the `LOG_MAKER_SERVER_PORT` port. POST to localhost:`LOG_MAKER_SERVER_PORT`/count=[n] to send n logs into the file

`LOG_MAKER_SERVER_PORT`: port for the LOG MAKER SERVER. Defaults to `3000`

`DISREGARD_LOG_TIMESTAMP`: When new logs are received with old timestamps, this determines whether to include them. Defaults to true.

#### Running on Docker
with Docker Compose, edit the docker-compose.yml environment vars, and run `docker-compose up`

Unfortunately, when running on Docker, you won't experience the true glory of colored terminal output. (the traffic alerts are red, and recoveries are green)

#### Running Tests
npm test. (Requires Jasmine to be installed globally)

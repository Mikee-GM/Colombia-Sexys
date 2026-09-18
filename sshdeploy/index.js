
const { Client } = require('ssh2');

const conn = new Client();
const commandToRun = process.argv[2] || 'ls -la';

conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec(commandToRun, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
      conn.end();
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).connect({
  host: '31.220.17.121',
  port: 22,
  username: 'root',
  password: 'Dlqv1lSlRzaI/ozKfg8?'
});


const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec('docker ps --format "{{.Names}}"', (err, stream) => {
    if (err) throw err;
    let names = '';
    stream.on('close', (code, signal) => {
      const backendContainer = names.split('\n').find(n => n.includes('backend') || n.includes('api'));
      if (backendContainer) {
        conn.exec(`docker logs --tail 500 ${backendContainer}`, (err2, stream2) => {
          if (err2) throw err2;
          stream2.on('close', () => conn.end()).on('data', data => console.log(data.toString())).stderr.on('data', data => console.error(data.toString()));
        });
      } else {
        console.log('No backend container found:', names);
        conn.end();
      }
    }).on('data', (data) => {
      names += data.toString();
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect({
  host: '31.220.17.121',
  port: 22,
  username: 'root',
  password: 'Dlqv1lSlRzaI/ozKfg8?'
});

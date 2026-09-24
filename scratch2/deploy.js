const { NodeSSH } = require('node-ssh');
const ssh = new NodeSSH();

async function run() {
  try {
    await ssh.connect({
      host: '31.220.17.121',
      username: 'root',
      password: 'Dlqv1lSlRzaI/ozKfg8?'
    });
    
    let result = await ssh.execCommand('cd /opt/colombia-sexys && git pull origin main && docker compose up -d --build backend');
    console.log('Result:', result.stdout);
    console.log('Error:', result.stderr);
    
    ssh.dispose();
  } catch (err) {
    console.error(err);
  }
}
run();


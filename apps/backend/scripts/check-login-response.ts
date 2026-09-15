import axios from 'axios';
async function main() {
  const r = await axios.post('http://localhost:3001/api/v1/auth/login', { username: 'admin', password: 'Admin@123456' });
  const user = r.data.data.user;
  console.log('user.branchId:', user?.branchId);
  console.log('user.id:', user?.id);
  console.log('user keys:', Object.keys(user || {}));
}
main();

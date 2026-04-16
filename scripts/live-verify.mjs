import crypto from 'node:crypto';

const base = 'http://127.0.0.1:5177';
const samples = [
  { name: 'live-a.pdf', mime: 'application/pdf', buf: Buffer.from('%PDF-1.4 live %%EOF') },
  { name: 'live-b.jpg', mime: 'image/jpeg', buf: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]) },
  { name: 'live-c.png', mime: 'image/png', buf: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]) },
];
const mods = ['employers', 'approvals', 'workers'];

const run = async () => {
  const rows = [];
  for (const m of mods) {
    let i = 1;
    for (const s of samples) {
      const body = {
        module: m,
        owner_id: i,
        folder: 'live',
        file_name: s.name,
        mime_type: s.mime,
        data_url: `data:${s.mime};base64,${s.buf.toString('base64')}`,
      };
      const t0 = Date.now();
      const upRes = await fetch(`${base}/api/ai/files`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-role': 'admin' },
        body: JSON.stringify(body),
      });
      const up = await upRes.json();
      const ms = Date.now() - t0;
      const dlRes = await fetch(base + up.download_url, { headers: { 'x-user-role': 'admin' } });
      const dlBuf = Buffer.from(await dlRes.arrayBuffer());
      const sha = crypto.createHash('sha256').update(dlBuf).digest('hex');
      rows.push({
        module: m,
        file: s.name,
        size: up.size,
        ms,
        sha_match: sha === up.sha256,
        status_up: upRes.status,
        status_dl: dlRes.status,
      });
      i += 1;
    }
  }
  console.log(JSON.stringify(rows, null, 2));
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

import filesHandler from './files';

export default async function handler(req: any, res: any) {
  // Backward-compatible wrapper; maps worker-files payload to unified files API.
  if (req.method === 'POST') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString('utf8');
    const body = raw ? JSON.parse(raw) : {};
    req.method = 'POST';
    req.body = undefined;
    const mapped = {
      module: 'workers',
      owner_id: Number(body?.owner_id || 0) || 1,
      folder: String(body?.category || 'work_docs'),
      file_name: body?.file_name,
      mime_type: body?.mime_type,
      data_url: body?.data_url,
    };
    // recreate stream-less body by monkey-patching iterator
    const content = Buffer.from(JSON.stringify(mapped), 'utf8');
    req[Symbol.asyncIterator] = async function* () {
      yield content;
    };
  }
  if (req.method === 'DELETE') {
    // pass-through delete payload
  }
  return filesHandler(req, res);
}

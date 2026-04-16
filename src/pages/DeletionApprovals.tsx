import React, { useEffect, useMemo, useState } from 'react';
import { listDeleteRequests, reviewDeleteRequest, DeleteRequestRecord } from '../api/fileDeletion';
import { isSuperAdmin } from '../utils/authRole';
import { normalizeErrorMessage } from '../utils/errorMessage';
import { subscribeDeleteNotice } from '../utils/deleteNotifications';

const DeletionApprovals: React.FC = () => {
  const [rows, setRows] = useState<DeleteRequestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string>('');
  const superAdmin = useMemo(() => isSuperAdmin(), []);
  const formatDate = (v?: string) => {
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) return '-';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await listDeleteRequests();
      setRows(list);
    } catch (err: any) {
      alert(normalizeErrorMessage(err, '獲取審批列表失敗'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const unSub = subscribeDeleteNotice(() => refresh());
    return () => unSub();
  }, []);

  const doApprove = async (requestId: string) => {
    if (!window.confirm('確認允許此刪除申請？允許後將執行實體刪除。')) return;
    try {
      setBusyId(requestId);
      await reviewDeleteRequest(requestId, 'APPROVE');
      alert('已允許並完成物理刪除');
      refresh();
    } catch (err: any) {
      alert(normalizeErrorMessage(err, '審批失敗'));
    } finally {
      setBusyId('');
    }
  };

  const doReject = async (requestId: string) => {
    const reason = String(rejectReasons[requestId] || '').trim();
    if (!window.confirm('確認拒絕此刪除申請？')) return;
    try {
      setBusyId(requestId);
      await reviewDeleteRequest(requestId, 'REJECT', reason);
      alert('已拒絕並通知申請人');
      refresh();
    } catch (err: any) {
      alert(normalizeErrorMessage(err, '審批失敗'));
    } finally {
      setBusyId('');
    }
  };

  if (!superAdmin) {
    return <div className="text-sm text-gray-500">僅超級管理員可查看審批管理。</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">審批管理</h1>
        <button
          type="button"
          onClick={refresh}
          className="px-3 py-1.5 rounded border border-gray-200 text-sm hover:bg-gray-50"
          disabled={loading}
        >
          重新整理
        </button>
      </div>
      <div className="bg-white rounded-apple border border-gray-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left">申請類型</th>
              <th className="px-4 py-3 text-left">公司</th>
              <th className="px-4 py-3 text-left">申請人</th>
              <th className="px-4 py-3 text-left">申請時間</th>
              <th className="px-4 py-3 text-left">刪除理由</th>
              <th className="px-4 py-3 text-left">狀態</th>
              <th className="px-4 py-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.request_id} className="border-t border-gray-100 align-top">
                <td className="px-4 py-3">刪除附件</td>
                <td className="px-4 py-3">{r.company_name || '-'}</td>
                <td className="px-4 py-3">{r.requester_name}（{r.requester_account || r.requester_id}）</td>
                <td className="px-4 py-3">{formatDate(r.created_at)}</td>
                <td className="px-4 py-3">{r.reason}</td>
                <td className="px-4 py-3">{r.status}</td>
                <td className="px-4 py-3 space-y-2">
                  {r.status === 'PENDING' ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => doApprove(r.request_id)}
                          className="px-2 py-1 rounded bg-green-600 text-white text-xs"
                          disabled={busyId === r.request_id}
                        >
                          允許
                        </button>
                        <button
                          type="button"
                          onClick={() => doReject(r.request_id)}
                          className="px-2 py-1 rounded bg-red-600 text-white text-xs"
                          disabled={busyId === r.request_id}
                        >
                          拒絕
                        </button>
                      </div>
                      <input
                        value={rejectReasons[r.request_id] || ''}
                        onChange={(e) => setRejectReasons(prev => ({ ...prev, [r.request_id]: e.target.value }))}
                        className="w-64 px-2 py-1 border rounded text-xs"
                        placeholder="拒絕原因（選填）"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {r.status === 'REJECTED' ? `拒絕原因：${r.reject_reason || '-'}` : '已處理'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-gray-400" colSpan={7}>
                  目前無待審批刪除申請
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DeletionApprovals;

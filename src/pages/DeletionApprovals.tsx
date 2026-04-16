import React, { useEffect, useMemo, useState } from 'react';
import { listDeleteRequests, reviewDeleteRequest, DeleteRequestRecord } from '../api/fileDeletion';
import { isSuperAdmin } from '../utils/authRole';
import { normalizeErrorMessage } from '../utils/errorMessage';
import { subscribeDeleteNotice } from '../utils/deleteNotifications';
import { pushInAppMessage } from '../utils/inAppMessages';

const DeletionApprovals: React.FC = () => {
  const [rows, setRows] = useState<DeleteRequestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'DONE'>('ALL');
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
      const res = await reviewDeleteRequest(requestId, 'APPROVE');
      const request = (res as any)?.request as DeleteRequestRecord | undefined;
      setRows(prev => prev.map(r => (r.request_id === requestId ? { ...r, status: 'APPROVED' } : r)));
      if (request) {
        pushInAppMessage({
          kind: 'delete_review',
          status: 'APPROVED',
          title: '刪除申請已允許',
          content: `你提交的附件刪除申請（${request.original_name}）已被超級管理員允許並完成刪除。`,
          fileName: request.original_name,
          operatedAt: new Date().toISOString(),
          recipientUserId: request.requester_id,
        });
      }
      alert('已允許並完成物理刪除');
    } catch (err: any) {
      alert(normalizeErrorMessage(err, '審批失敗'));
    } finally {
      setBusyId('');
    }
  };

  const doReject = async (requestId: string) => {
    if (!window.confirm('確認拒絕此刪除申請？')) return;
    try {
      setBusyId(requestId);
      const res = await reviewDeleteRequest(requestId, 'REJECT');
      const request = (res as any)?.request as DeleteRequestRecord | undefined;
      setRows(prev => prev.map(r => (r.request_id === requestId ? { ...r, status: 'REJECTED' } : r)));
      if (request) {
        pushInAppMessage({
          kind: 'delete_review',
          status: 'REJECTED',
          title: '刪除申請被拒絕',
          content: `你提交的附件刪除申請（${request.original_name}）已被超級管理員拒絕。`,
          fileName: request.original_name,
          rejectReason: String((request as any).reject_reason || ''),
          operatedAt: new Date().toISOString(),
          recipientUserId: request.requester_id,
        });
      }
      alert('已拒絕並通知申請人');
    } catch (err: any) {
      alert(normalizeErrorMessage(err, '審批失敗'));
    } finally {
      setBusyId('');
    }
  };

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const done = r.status !== 'PENDING';
      if (statusFilter === 'PENDING' && r.status !== 'PENDING') return false;
      if (statusFilter === 'DONE' && !done) return false;
      if (!q) return true;
      const hay = [
        r.approval_no,
        r.company_name,
        r.requester_name,
        r.original_name,
        r.reason,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [rows, query, statusFilter]);

  const exportCsv = () => {
    const headers = ['審批編號', '申請類型', '公司', '申請人', '申請時間', '刪除理由', '狀態'];
    const toStatus = (r: DeleteRequestRecord) => (r.status === 'PENDING' ? '待處理' : '處理完成');
    const body = visibleRows.map((r) => [
      r.approval_no || '',
      '刪除附件',
      r.company_name || '',
      r.requester_name || '',
      formatDate(r.created_at),
      r.reason || '',
      toStatus(r),
    ]);
    const csv = [headers, ...body]
      .map((row) => row.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deletion-approvals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!superAdmin) {
    return <div className="text-sm text-gray-500">僅超級管理員可查看審批管理。</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">審批管理</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="px-3 py-1.5 rounded border border-gray-200 text-sm hover:bg-gray-50"
          >
            匯出報表
          </button>
          <button
            type="button"
            onClick={refresh}
            className="px-3 py-1.5 rounded border border-gray-200 text-sm hover:bg-gray-50"
            disabled={loading}
          >
            重新整理
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-64 px-3 py-2 border rounded-lg text-sm"
          placeholder="搜尋審批編號/公司/申請人"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="ALL">全部狀態</option>
          <option value="PENDING">待處理</option>
          <option value="DONE">處理完成</option>
        </select>
      </div>
      <div className="bg-white rounded-apple border border-gray-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left">審批編號</th>
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
            {visibleRows.map((r) => (
              <tr key={r.request_id} className="border-t border-gray-100 align-top">
                <td className="px-4 py-3">{r.approval_no || '-'}</td>
                <td className="px-4 py-3">刪除附件</td>
                <td className="px-4 py-3">{r.company_name || '-'}</td>
                <td className="px-4 py-3">{r.requester_name}</td>
                <td className="px-4 py-3">{formatDate(r.created_at)}</td>
                <td className="px-4 py-3">{r.reason}</td>
                <td className="px-4 py-3">{r.status === 'PENDING' ? '待處理' : '處理完成'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => doApprove(r.request_id)}
                      className="px-2 py-1 rounded bg-green-600 text-white text-xs disabled:opacity-50"
                      disabled={busyId === r.request_id || r.status !== 'PENDING'}
                    >
                      允許
                    </button>
                    <button
                      type="button"
                      onClick={() => doReject(r.request_id)}
                      className="px-2 py-1 rounded bg-red-600 text-white text-xs disabled:opacity-50"
                      disabled={busyId === r.request_id || r.status !== 'PENDING'}
                    >
                      拒絕
                    </button>
                  </div>
                  {r.status !== 'PENDING' && (
                    <div className="mt-1 text-xs text-gray-400">此申請已處理完成，不可再操作</div>
                  )}
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-gray-400" colSpan={8}>
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

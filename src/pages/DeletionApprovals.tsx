import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { RefreshCw } from 'lucide-react';
import { listDeleteRequests, reviewDeleteRequest, DeleteRequestRecord, pruneCompletedDeleteRequests } from '../api/fileDeletion';
import { isSuperAdmin } from '../utils/authRole';
import { normalizeErrorMessage } from '../utils/errorMessage';
import { subscribeDeleteNotice } from '../utils/deleteNotifications';
import { pushInAppMessage } from '../utils/inAppMessages';
import {
  listQuotaDeleteRequests,
  QuotaDeleteRequestRecord,
  reviewQuotaDeleteRequest,
  pruneCompletedQuotaDeleteRequests,
} from '../utils/quotaDeleteRequests';
import {
  listEntityDeleteRequests,
  reviewEntityDeleteRequest,
  pruneCompletedEntityDeleteRequests,
} from '../utils/entityDeleteRequests';
import { pushDeleteNotice } from '../utils/deleteNotifications';

type UnifiedDeleteRow = {
  kind: 'file' | 'quota' | 'entity';
  request_id: string;
  approval_no: string;
  source_no?: string;
  company_name: string;
  requester_name: string;
  requester_id?: string;
  created_at: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  entity_module?: 'approvals' | 'employers' | 'workers';
};

const DELETE_APPROVAL_NO_MAP_KEY = 'deletion_approval_no_map_v1';

const readApprovalNoMap = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(DELETE_APPROVAL_NO_MAP_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeApprovalNoMap = (map: Record<string, string>) => {
  localStorage.setItem(DELETE_APPROVAL_NO_MAP_KEY, JSON.stringify(map));
};

const ensureApprovalNo = (requestId: string) => {
  const map = readApprovalNoMap();
  const key = String(requestId || '').trim();
  const exists = String(map[key] || '').trim();
  if (exists) return exists;
  const nums = Object.values(map)
    .map((v) => Number(String(v).replace(/^EST/i, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  const code = `EST${String(next).padStart(8, '0')}`;
  map[key] = code;
  writeApprovalNoMap(map);
  return code;
};

const DeletionApprovals: React.FC = () => {
  const [rows, setRows] = useState<UnifiedDeleteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string>('');
  const [pruneConfirmOpen, setPruneConfirmOpen] = useState(false);
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
      const quotaList = listQuotaDeleteRequests();
      const entityList = listEntityDeleteRequests();
      const merged: UnifiedDeleteRow[] = [
        ...list.map((r): UnifiedDeleteRow => ({
          kind: 'file',
          request_id: r.request_id,
          approval_no: ensureApprovalNo(r.request_id),
          source_no: r.approval_no || '',
          company_name: r.company_name || '',
          requester_name: r.requester_name || '',
          requester_id: r.requester_id,
          created_at: r.created_at,
          reason: r.reason || '',
          status: r.status,
        })),
        ...quotaList.map((r): UnifiedDeleteRow => ({
          kind: 'quota',
          request_id: r.request_id,
          approval_no: ensureApprovalNo(r.request_id),
          source_no: r.approval_no || '',
          company_name: r.company_name || '',
          requester_name: r.requester_name || '',
          requester_id: r.requester_id,
          created_at: r.created_at,
          reason: r.reason || '',
          status: r.status,
        })),
        ...entityList.map((r): UnifiedDeleteRow => ({
          kind: 'entity',
          request_id: r.request_id,
          approval_no: ensureApprovalNo(r.request_id),
          source_no: r.record_no || '',
          company_name: r.company_name || '',
          requester_name: r.requester_name || '',
          requester_id: r.requester_id,
          created_at: r.created_at,
          reason: r.reason || '',
          status: r.status,
          entity_module: r.module,
        })),
      ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      setRows(merged);
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

  const doApprove = async (row: UnifiedDeleteRow) => {
    if (!window.confirm('確認允許此刪除申請？允許後將執行實體刪除。')) return;
    try {
      setBusyId(row.request_id);
      if (row.kind === 'file') {
        const res = await reviewDeleteRequest(row.request_id, 'APPROVE');
        const request = (res as any)?.request as DeleteRequestRecord | undefined;
        setRows(prev => prev.map(r => (r.request_id === row.request_id ? { ...r, status: 'APPROVED' } : r)));
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
      } else {
        if (row.kind === 'quota') await Promise.resolve(reviewQuotaDeleteRequest(row.request_id, 'APPROVE'));
        else await reviewEntityDeleteRequest(row.request_id, 'APPROVE');
      }
      await refresh();
      pushDeleteNotice({
        at: Date.now(),
        message: '刪除申請審批狀態已更新',
        uid: row.request_id,
        module: row.kind === 'entity' ? String(row.entity_module || 'deletion-approvals') : 'deletion-approvals',
      });
      alert('已允許並完成刪除處理');
    } catch (err: any) {
      alert(normalizeErrorMessage(err, '審批失敗'));
    } finally {
      setBusyId('');
    }
  };

  const doReject = async (row: UnifiedDeleteRow) => {
    if (!window.confirm('確認拒絕此刪除申請？')) return;
    try {
      setBusyId(row.request_id);
      if (row.kind === 'file') {
        const res = await reviewDeleteRequest(row.request_id, 'REJECT');
        const request = (res as any)?.request as DeleteRequestRecord | undefined;
        setRows(prev => prev.map(r => (r.request_id === row.request_id ? { ...r, status: 'REJECTED' } : r)));
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
      } else {
        if (row.kind === 'quota') await Promise.resolve(reviewQuotaDeleteRequest(row.request_id, 'REJECT'));
        else await reviewEntityDeleteRequest(row.request_id, 'REJECT');
      }
      await refresh();
      pushDeleteNotice({
        at: Date.now(),
        message: '刪除申請審批狀態已更新',
        uid: row.request_id,
        module: row.kind === 'entity' ? String(row.entity_module || 'deletion-approvals') : 'deletion-approvals',
      });
      alert('已拒絕並通知申請人');
    } catch (err: any) {
      alert(normalizeErrorMessage(err, '審批失敗'));
    } finally {
      setBusyId('');
    }
  };

  const handlePruneCompleted = async () => {
    try {
      setLoading(true);
      setPruneConfirmOpen(false);
      const fileResult = await pruneCompletedDeleteRequests();
      const quotaResult = pruneCompletedQuotaDeleteRequests();
      const entityResult = pruneCompletedEntityDeleteRequests();
      const removed =
        Number(fileResult?.removed || 0) +
        Number(quotaResult?.removed || 0) +
        Number(entityResult?.removed || 0);
      const keptPending =
        Number(fileResult?.kept_pending || 0) +
        Number(quotaResult?.kept_pending || 0) +
        Number(entityResult?.kept_pending || 0);
      await refresh();
      alert(`清理完成：已移除 ${removed} 筆，保留待處理 ${keptPending} 筆。`);
    } catch (err: any) {
      alert(normalizeErrorMessage(err, '清理已處理審批記錄失敗'));
    } finally {
      setLoading(false);
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
        r.source_no,
        r.company_name,
        r.requester_name,
        r.reason,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [rows, query, statusFilter]);

  const exportCsv = () => {
    const headers = ['審批編號', '申請類型', '公司', '申請人', '申請時間', '刪除理由', '狀態'];
    const toStatus = (r: UnifiedDeleteRow) => (r.status === 'PENDING' ? '待處理' : '處理完成');
    const body = visibleRows.map((r) => [
      r.approval_no || '',
      r.kind === 'file'
        ? '刪除附件'
        : r.kind === 'quota'
          ? '刪除申請配額'
          : r.entity_module === 'approvals'
            ? '刪除批文'
            : r.entity_module === 'employers'
              ? '刪除僱主'
              : '刪除勞工',
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
            onClick={() => setPruneConfirmOpen(true)}
            className="flex items-center space-x-2 bg-apple-blue hover:bg-blue-600 text-white px-4 py-2 rounded-apple-sm transition-colors shadow-sm disabled:opacity-70"
            disabled={loading}
          >
            清理已處理
          </button>
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
            className="p-2 text-gray-500 hover:text-apple-blue hover:bg-blue-50 rounded-full transition-colors"
            disabled={loading}
            title="重新整理"
            aria-label="重新整理"
          >
            <RefreshCw className={clsx("w-5 h-5", loading && "animate-spin")} />
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
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">審批編號</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">申請類型</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">公司</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">申請人</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">申請時間</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">刪除理由</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">狀態</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.request_id} className="border-t border-gray-100 align-top">
                <td className="px-4 py-3">{r.approval_no || '-'}</td>
                <td className="px-4 py-3">
                  {r.kind === 'file'
                    ? '刪除附件'
                    : r.kind === 'quota'
                      ? '刪除申請配額'
                      : r.entity_module === 'approvals'
                        ? '刪除批文'
                        : r.entity_module === 'employers'
                          ? '刪除僱主'
                          : '刪除勞工'}
                </td>
                <td className="px-4 py-3">{r.company_name || '-'}</td>
                <td className="px-4 py-3">{r.requester_name}</td>
                <td className="px-4 py-3">{formatDate(r.created_at)}</td>
                <td className="px-4 py-3">{r.reason}</td>
                <td className="px-4 py-3">{r.status === 'PENDING' ? '待處理' : '處理完成'}</td>
                <td className="px-4 py-3">
                  {r.status === 'PENDING' ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => doApprove(r)}
                        className="px-2 py-1 rounded bg-green-600 text-white text-xs disabled:opacity-50"
                        disabled={busyId === r.request_id}
                      >
                        允許
                      </button>
                      <button
                        type="button"
                        onClick={() => doReject(r)}
                        className="px-2 py-1 rounded bg-red-600 text-white text-xs disabled:opacity-50"
                        disabled={busyId === r.request_id}
                      >
                        拒絕
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-start gap-1">
                      <span
                        className={clsx(
                          "px-2 py-1 rounded text-xs text-white",
                          r.status === 'APPROVED' ? "bg-green-600" : "bg-red-600"
                        )}
                      >
                        {r.status === 'APPROVED' ? '允許' : '拒絕'}
                      </span>
                    </div>
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
      {pruneConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-gray-200 shadow-xl p-4 space-y-3">
            <div className="text-base font-medium">確認清理已處理記錄</div>
            <div className="text-sm text-gray-600">
              只清理「已處理完成（允許/拒絕）」的審批記錄，保留待處理項目。是否繼續？
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPruneConfirmOpen(false)}
                className="px-3 py-1.5 rounded border border-gray-200 text-sm hover:bg-gray-50"
                disabled={loading}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handlePruneCompleted}
                className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm hover:bg-amber-700 disabled:opacity-50"
                disabled={loading}
              >
                確認清理
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeletionApprovals;

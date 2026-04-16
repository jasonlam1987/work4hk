import React, { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import { DeleteContext } from '../api/fileDeletion';
import { isSuperAdmin } from '../utils/authRole';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  context: DeleteContext | null;
  onConfirmPermanentDelete: (ctx: DeleteContext) => Promise<void>;
  onSubmitRequest: (ctx: DeleteContext, reason: string) => Promise<void>;
};

const FileDeleteActionDialog: React.FC<Props> = ({
  isOpen,
  onClose,
  context,
  onConfirmPermanentDelete,
  onSubmitRequest,
}) => {
  const getErrorMessage = (err: any, fallback: string) => {
    const detail = err?.response?.data?.error || err?.response?.data?.detail || err?.message;
    return String(detail || fallback);
  };
  const [confirmText, setConfirmText] = useState('');
  const [reasonType, setReasonType] = useState<'upload_error' | 'other'>('upload_error');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const superAdmin = useMemo(() => isSuperAdmin(), [isOpen]);

  const canDelete = superAdmin && confirmText.trim().toUpperCase() === 'DELETE';
  const finalReason = reasonType === 'upload_error' ? '錯誤上傳' : reason.trim();
  const canRequest = !superAdmin && (reasonType === 'upload_error' || reason.trim().length >= 3);

  const handleConfirmDelete = async () => {
    if (!canDelete || !context || busy) return;
    setBusy(true);
    try {
      await onConfirmPermanentDelete(context);
      closeAndReset();
    } catch (err: any) {
      alert(getErrorMessage(err, '刪除失敗'));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!canRequest || !context || busy) return;
    setBusy(true);
    try {
      await onSubmitRequest(context, finalReason);
      closeAndReset();
    } catch (err: any) {
      alert(getErrorMessage(err, '申請刪除失敗'));
    } finally {
      setBusy(false);
    }
  };

  const closeAndReset = () => {
    setConfirmText('');
    setReasonType('upload_error');
    setReason('');
    setBusy(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={closeAndReset} title="永久刪除警告" className="max-w-xl">
      {context && (
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-center gap-2 text-red-700 font-semibold">
              <AlertTriangle className="w-5 h-5" />
              <span>永久刪除警告</span>
            </div>
            <p className="mt-2 text-sm text-red-700">檔案一旦刪除將無法復原，請謹慎操作</p>
          </div>

          <div className="text-sm text-gray-700 space-y-1">
            <div><span className="font-medium">檔案名稱：</span>{context.fileName}</div>
            <div><span className="font-medium">所屬公司：</span>{context.companyName}</div>
            <div><span className="font-medium">板塊：</span>{context.sectionName}</div>
          </div>

          {superAdmin ? (
            <div>
              <label className="text-sm font-medium text-gray-700">請輸入 `DELETE` 以啟用「確認永久刪除」</label>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  handleConfirmDelete();
                }}
                className="mt-1 w-full px-3 py-2 border rounded-lg"
                placeholder="DELETE"
              />
              <p className="mt-1 text-xs text-gray-500">輸入不分大小寫，前後空格會自動忽略</p>
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium text-gray-700">刪除理由（必填）</label>
              <div className="mt-1 space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="delete-reason-type"
                    checked={reasonType === 'upload_error'}
                    onChange={() => setReasonType('upload_error')}
                  />
                  <span>錯誤上傳</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="delete-reason-type"
                    checked={reasonType === 'other'}
                    onChange={() => setReasonType('other')}
                  />
                  <span>其他（自行輸入）</span>
                </label>
              </div>
              {reasonType === 'other' && (
                <>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => {
                      if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;
                      e.preventDefault();
                      handleSubmitRequest();
                    }}
                    className="mt-2 w-full px-3 py-2 border rounded-lg min-h-24"
                    placeholder="請填寫刪除理由"
                  />
                  <p className="mt-1 text-xs text-gray-500">可用 Ctrl+Enter 快速提交</p>
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeAndReset}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
              disabled={busy}
            >
              取消
            </button>
            {superAdmin ? (
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={!canDelete || busy}
                className="px-4 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50"
              >
                {busy ? '刪除中...' : '確認永久刪除'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmitRequest}
                disabled={!canRequest || busy}
                className="px-4 py-2 rounded-lg bg-apple-blue text-white disabled:opacity-50"
              >
                申請刪除
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default FileDeleteActionDialog;

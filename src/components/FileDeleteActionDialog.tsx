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
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const superAdmin = useMemo(() => isSuperAdmin(), [isOpen]);

  const canDelete = superAdmin && confirmText.trim().toUpperCase() === 'DELETE';
  const canRequest = !superAdmin && reason.trim().length >= 3;

  const closeAndReset = () => {
    setConfirmText('');
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
            <div className="break-all"><span className="font-medium">存檔路徑：</span>{context.storedPath || '-'}</div>
          </div>

          {superAdmin ? (
            <div>
              <label className="text-sm font-medium text-gray-700">請輸入 `DELETE` 以啟用「確認永久刪除」</label>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="mt-1 w-full px-3 py-2 border rounded-lg"
                placeholder="DELETE"
              />
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium text-gray-700">刪除理由（必填）</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full px-3 py-2 border rounded-lg min-h-24"
                placeholder="請填寫刪除理由"
              />
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
                onClick={async () => {
                  if (!canDelete || !context) return;
                  setBusy(true);
                  try {
                    await onConfirmPermanentDelete(context);
                    closeAndReset();
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={!canDelete || busy}
                className="px-4 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50"
              >
                確認永久刪除
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  if (!canRequest || !context) return;
                  setBusy(true);
                  try {
                    await onSubmitRequest(context, reason.trim());
                    closeAndReset();
                  } finally {
                    setBusy(false);
                  }
                }}
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

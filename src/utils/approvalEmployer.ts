export const resolveApprovalEmployerId = (approvalLike: any): number => {
  const raw =
    approvalLike && approvalLike.employer_id !== undefined && approvalLike.employer_id !== null
      ? approvalLike.employer_id
      : approvalLike?.employerId;
  return Number(raw || 0);
};

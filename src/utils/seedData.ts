import { createEmployer } from '../api/employers';
import { createWorker } from '../api/workers';
import { createApproval } from '../api/approvals';
import { createPosition } from '../api/jobs';

export const seedMockData = async () => {
  try {
    console.log('開始匯入測試數據...');
    
    // 1. 建立僱主
    const e1 = await createEmployer({ 
      name: '科技建材有限公司', 
      english_name: 'Tech Build Ltd', 
      code: 'TB001', 
      company_address: '香港中環科技道1號',
      business_registration_number: '12345678',
      business_type: '建築工程'
    });
    
    const e2 = await createEmployer({ 
      name: '環球餐飲集團', 
      english_name: 'Global Food Group', 
      code: 'GF002', 
      company_address: '香港旺角美食街88號',
      business_registration_number: '87654321',
      business_type: '餐飲服務'
    });

    // 2. 建立批文 (一個安全，一個即將到期)
    const a1 = await createApproval({ 
      employer_id: e1.id, 
      partner_id: 1, 
      approval_number: 'APP-2023-001', 
      headcount: 50, 
      valid_until: '2024-12-31',
      department: '勞工處',
      signatory_name: '張主任'
    });

    const urgentDate = new Date();
    urgentDate.setDate(urgentDate.getDate() + 15); // 15天後到期，觸發警告

    const a2 = await createApproval({ 
      employer_id: e2.id, 
      partner_id: 1, 
      approval_number: 'APP-2023-002', 
      headcount: 20, 
      valid_until: urgentDate.toISOString().split('T')[0],
      department: '勞工處',
      signatory_name: '李主任'
    });

    // 3. 建立職位
    const p1 = await createPosition({ 
      employer_id: e1.id, 
      approval_id: a1.id, 
      position_name: '建築工人', 
      position_code: 'CON-01', 
      employment_term: 24, 
      contract_salary: '15000', 
      usage_status: '空闲' 
    }).catch(e => { console.log('建立職位 1 失敗，跳過'); return { id: 1 }; });

    const p2 = await createPosition({ 
      employer_id: e2.id, 
      approval_id: a2.id, 
      position_name: '餐廳服務員', 
      position_code: 'FNB-01', 
      employment_term: 12, 
      contract_salary: '12000', 
      usage_status: '空闲' 
    }).catch(e => { console.log('建立職位 2 失敗，跳過'); return { id: 2 }; });

    // 4. 建立勞工
    await createWorker({ 
      labour_name: '陳大文', 
      id_card_number: 'A1234567', 
      employer_id: e1.id, 
      position_id: p1.id, 
      labour_status: '在職', 
      contract_salary: '15000', 
      employment_term: '24个月'
    });

    await createWorker({ 
      labour_name: '李小明', 
      id_card_number: 'B7654321', 
      employer_id: e2.id, 
      position_id: p2.id, 
      labour_status: '在職', 
      contract_salary: '12000', 
      employment_term: '12个月'
    });

    await createWorker({ 
      labour_name: '王美麗', 
      id_card_number: 'C9876543', 
      employer_id: e2.id, 
      position_id: p2.id, 
      labour_status: '辦證中', 
      contract_salary: '12000', 
      employment_term: '12个月'
    });

    console.log('測試數據匯入完成！');
    return true;
  } catch (error) {
    console.error('匯入測試數據失敗:', error);
    throw error;
  }
};

-- 啟用 uuid-ossp 擴展 (通常 Supabase 已預設啟用)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 用戶表（擴展 auth.users 的信息，這裡我們先創建獨立的 users 表，因為 Supabase 默認使用 auth.users，為了簡單，我們可以綁定 auth.users）
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    health_goal VARCHAR(50) DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 創建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at);

-- 飲食記錄表（food_records）
CREATE TABLE IF NOT EXISTS public.food_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    food_name VARCHAR(255) NOT NULL,
    image_url TEXT,
    calories INTEGER,
    nutrition_info JSONB,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 創建索引
CREATE INDEX IF NOT EXISTS idx_food_records_user_id ON public.food_records(user_id);
CREATE INDEX IF NOT EXISTS idx_food_records_recorded_at ON public.food_records(recorded_at DESC);

-- 健康報告表（health_reports）
CREATE TABLE IF NOT EXISTS public.health_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    health_score INTEGER CHECK (health_score >= 0 AND health_score <= 100),
    ai_suggestions JSONB,
    report_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 創建索引
CREATE INDEX IF NOT EXISTS idx_health_reports_user_id ON public.health_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_health_reports_report_date ON public.health_reports(report_date DESC);

-- 社區內容表（community_posts）
CREATE TABLE IF NOT EXISTS public.community_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_url TEXT,
    is_approved BOOLEAN DEFAULT false,
    ai_check_status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 創建索引
CREATE INDEX IF NOT EXISTS idx_community_posts_user_id ON public.community_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_approved ON public.community_posts(is_approved);
CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON public.community_posts(created_at DESC);

-- 設置 RLS (Row Level Security)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

-- public.users 權限
CREATE POLICY "Users can view their own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- 允許匿名用戶查看已批准的社區內容
CREATE POLICY "Allow view approved posts" ON public.community_posts
    FOR SELECT USING (is_approved = true);

-- 認證用戶可以創建社區內容
CREATE POLICY "Users can create posts" ON public.community_posts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 認證用戶可以創建飲食記錄
CREATE POLICY "Users can create food records" ON public.food_records
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 用戶只能查看自己的飲食記錄
CREATE POLICY "Users can view own food records" ON public.food_records
    FOR SELECT USING (auth.uid() = user_id);

-- 用戶只能查看自己的健康報告
CREATE POLICY "Users can view own reports" ON public.health_reports
    FOR SELECT USING (auth.uid() = user_id);

-- 給予 anon 和 authenticated 角色權限
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

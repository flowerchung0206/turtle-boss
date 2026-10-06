import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// 這個 client 只用 publishable(anon) key，權限受資料庫的 RLS /
// grant 規則控制（見 turtle-boutique-backend/schema.sql）。
// 成本相關欄位從資料庫層級就不會透過這個 client 拿到，
// 不是只靠前端程式碼不顯示而已。
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type PublicTurtle = {
  id: number;
  code: string;
  name: string;
  category_id: number | null;
  category_name: string | null;
  status: string;
  price: number | null;
  view_count: number;
  wishlist_count: number;
  cover_url: string | null;
  photos: string[];
  videos: string[];
  breed?: string;
  sex?: string;
  age_months?: number;
  weight_g?: number;
  source?: string;
  pattern?: string;
  personality?: string;
  acquired_date?: string;
  husbandry_status?: string;
  note?: string;
};

export type Category = {
  id: number;
  name: string;
  sort_order: number;
};

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, sort_order')
    .order('sort_order');
  if (error) {
    console.error('fetchCategories error', error);
    return [];
  }
  return data ?? [];
}

export async function fetchPublicTurtles(): Promise<PublicTurtle[]> {
  const { data, error } = await supabase.rpc('list_turtles_public');
  if (error) {
    console.error('fetchPublicTurtles error', error);
    return [];
  }
  return (data as PublicTurtle[]) ?? [];
}

export async function fetchPublicTurtle(id: number): Promise<PublicTurtle | null> {
  const { data, error } = await supabase.rpc('get_turtle_public', { p_id: id });
  if (error) {
    console.error('fetchPublicTurtle error', error);
    return null;
  }
  return (data as PublicTurtle) ?? null;
}

export async function recordTurtleView(id: number): Promise<void> {
  const { error } = await supabase.rpc('record_turtle_view', { p_id: id });
  if (error) console.error('recordTurtleView error', error);
}

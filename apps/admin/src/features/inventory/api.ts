import { supabase } from '@/lib/supabase';
import { sanitizeFilterValue } from '@/lib/search';

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  location: string | null;
  condition: string | null;
  code: string | null;
  minQuantity: number;
  quantity: number;
  lowStock: boolean;
};

const ITEM_COLUMNS = 'id, name, category, location, condition, code, min_quantity';

function toInventoryItem(item: { id: string; name: string; category: string; location: string | null; condition: string | null; code: string | null; min_quantity: number }, quantity: number): InventoryItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    location: item.location,
    condition: item.condition,
    code: item.code,
    minQuantity: item.min_quantity,
    quantity,
    lowStock: quantity <= item.min_quantity,
  };
}

export async function listInventoryItems(query: string): Promise<InventoryItem[]> {
  let request = supabase.from('inventory_items').select(ITEM_COLUMNS).eq('status', 'active');
  const term = sanitizeFilterValue(query);
  if (term) request = request.or(`name.ilike.%${term}%,category.ilike.%${term}%,code.ilike.%${term}%`);

  const { data: items, error } = await request;
  if (error) throw error;

  const results = await Promise.all(
    (items ?? []).map(async (item) => {
      const { data: qty } = await supabase.rpc('inventory_quantity', { p_item_id: item.id });
      return toInventoryItem(item, (qty as number) ?? 0);
    }),
  );

  return results.sort((a, b) => Number(b.lowStock) - Number(a.lowStock));
}

export async function getInventoryItem(itemId: string): Promise<InventoryItem | null> {
  const { data, error } = await supabase.from('inventory_items').select(ITEM_COLUMNS).eq('id', itemId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: qty } = await supabase.rpc('inventory_quantity', { p_item_id: itemId });
  return toInventoryItem(data, (qty as number) ?? 0);
}

export async function createInventoryItem(input: { name: string; category: string; location?: string; condition?: string; code?: string; minQuantity: number }): Promise<string> {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      name: input.name,
      category: input.category,
      location: input.location || null,
      condition: input.condition || null,
      code: input.code || null,
      min_quantity: input.minQuantity,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export type InventoryTxnType = 'receipt' | 'issue' | 'return' | 'write_off' | 'adjustment';
export type InventoryTransaction = { id: string; txnType: InventoryTxnType; quantity: number; note: string | null; createdAt: string };

export async function listInventoryTransactions(itemId: string): Promise<InventoryTransaction[]> {
  const { data, error } = await supabase
    .from('inventory_transactions')
    .select('id, txn_type, quantity, note, created_at')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, txnType: r.txn_type as InventoryTxnType, quantity: r.quantity, note: r.note, createdAt: r.created_at }));
}

export async function recordInventoryTransaction(input: { itemId: string; txnType: InventoryTxnType; quantity: number; note?: string; actorId: string }): Promise<void> {
  const { error } = await supabase.from('inventory_transactions').insert({
    item_id: input.itemId,
    txn_type: input.txnType,
    quantity: input.quantity,
    note: input.note || null,
    actor_id: input.actorId,
  });
  if (error) throw error;
}

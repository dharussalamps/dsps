import { supabase } from '@/lib/supabase';
import { sanitizeFilterValue } from '@/lib/search';

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  location: string | null;
  minQuantity: number;
  quantity: number;
  lowStock: boolean;
};

export async function listInventoryItems(query: string): Promise<InventoryItem[]> {
  let request = supabase.from('inventory_items').select('id, name, category, location, min_quantity').eq('status', 'active');
  const term = sanitizeFilterValue(query);
  if (term) request = request.or(`name.ilike.%${term}%,category.ilike.%${term}%,code.ilike.%${term}%`);

  const { data: items, error } = await request;
  if (error) throw error;

  const results = await Promise.all(
    (items ?? []).map(async (item) => {
      const { data: qty } = await supabase.rpc('inventory_quantity', { p_item_id: item.id });
      const quantity = (qty as number) ?? 0;
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        location: item.location,
        minQuantity: item.min_quantity,
        quantity,
        lowStock: quantity <= item.min_quantity,
      };
    }),
  );

  return results.sort((a, b) => Number(b.lowStock) - Number(a.lowStock));
}

export async function getInventoryItem(itemId: string): Promise<InventoryItem | null> {
  const { data, error } = await supabase.from('inventory_items').select('id, name, category, location, min_quantity').eq('id', itemId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: qty } = await supabase.rpc('inventory_quantity', { p_item_id: itemId });
  const quantity = (qty as number) ?? 0;
  return { id: data.id, name: data.name, category: data.category, location: data.location, minQuantity: data.min_quantity, quantity, lowStock: quantity <= data.min_quantity };
}

export async function createInventoryItem(input: { name: string; category: string; location?: string; minQuantity: number }): Promise<string> {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({ name: input.name, category: input.category, location: input.location || null, min_quantity: input.minQuantity })
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

import { useQuery } from '@tanstack/react-query';
import { getInventoryItem, listInventoryItems, listInventoryTransactions } from './api';

export function useInventoryItems(query: string) {
  return useQuery({ queryKey: ['inventory', 'items', query.trim()], queryFn: () => listInventoryItems(query) });
}

export function useInventoryItem(itemId: string | undefined) {
  return useQuery({
    queryKey: ['inventory', 'item', itemId],
    queryFn: () => getInventoryItem(itemId as string),
    enabled: !!itemId,
  });
}

export function useInventoryTransactions(itemId: string | undefined) {
  return useQuery({
    queryKey: ['inventory', 'transactions', itemId],
    queryFn: () => listInventoryTransactions(itemId as string),
    enabled: !!itemId,
  });
}

import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, Screen, ScreenHeader, TextField } from '@/components';
import { listStaff, type StaffSummary } from '@/features/staff/api';
import { parseDMY } from '@/lib/date';
import { semantic, spacing, typography } from '@/theme/tokens';
import { useAuditEntities, useAuditLog } from './hooks';

/** FR-ADM-05: "the principal may search the audit log by actor, entity, or date range." */
export function AuditLogScreen() {
  const navigation = useNavigation();
  const [entity, setEntity] = useState<string | null>(null);
  const [actor, setActor] = useState<StaffSummary | null>(null);
  const [actorQuery, setActorQuery] = useState('');
  const [actorResults, setActorResults] = useState<StaffSummary[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const entities = useAuditEntities();
  const isoFromDate = parseDMY(fromDate);
  const isoToDate = parseDMY(toDate);
  const audit = useAuditLog({
    entity: entity ?? undefined,
    actorId: actor?.id,
    fromDate: isoFromDate ? `${isoFromDate}T00:00:00` : undefined,
    toDate: isoToDate ? `${isoToDate}T23:59:59` : undefined,
  });

  async function searchActor(q: string) {
    setActorQuery(q);
    setActorResults(q.trim() ? await listStaff(q) : []);
  }

  function clearFilters() {
    setEntity(null);
    setActor(null);
    setActorQuery('');
    setFromDate('');
    setToDate('');
  }

  const hasFilters = !!entity || !!actor || !!fromDate.trim() || !!toDate.trim();

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title="Audit log" subtitle={`${audit.data?.length ?? 0} entries${hasFilters ? ' (filtered)' : ''}`} tone="onPrimary" back={navigation.canGoBack()}>
          <Button label={showFilters ? 'Hide filters' : 'Filters'} icon="filter-outline" size="sm" variant="secondary" onPress={() => setShowFilters((v) => !v)} />
        </ScreenHeader>
      </Hero>

      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        {showFilters ? (
          <Card>
            <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>ENTITY</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {(entities.data ?? []).map((e) => (
                <Button key={e} label={e} size="sm" variant={entity === e ? 'primary' : 'outline'} onPress={() => setEntity(entity === e ? null : e)} />
              ))}
            </View>
            <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>ACTOR</Text>
            <TextField placeholder="Search by name" value={actorQuery} onChangeText={(v) => void searchActor(v)} />
            {actorQuery && !actor ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {actorResults.map((s) => (
                  <Button key={s.id} label={s.fullName} size="sm" variant="outline" onPress={() => { setActor(s); setActorQuery(s.fullName); }} />
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <TextField label="From" placeholder="DD/MM/YYYY" value={fromDate} onChangeText={setFromDate} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="To" placeholder="DD/MM/YYYY" value={toDate} onChangeText={setToDate} />
              </View>
            </View>
            {hasFilters ? <Button label="Clear filters" size="sm" variant="ghost" onPress={clearFilters} /> : null}
          </Card>
        ) : null}
      </View>

      {audit.isLoading ? (
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={audit.data ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl }}
          ListEmptyComponent={<EmptyState title="No audit entries" />}
          renderItem={({ item }) => (
            <Card flat>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                  {item.action} · {item.entity}
                </Text>
                <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{new Date(item.createdAt).toLocaleString()}</Text>
              </View>
              <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{item.actorName ?? 'System'}</Text>
              {item.reason ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{item.reason}</Text> : null}
            </Card>
          )}
        />
      )}
    </Screen>
  );
}

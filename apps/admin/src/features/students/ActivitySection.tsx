import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Icon, TextField } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { spacing, typography, semantic } from '@/theme/tokens';
import { addAchievement, addMembership } from './api';
import { useAchievements, useMemberships } from './hooks';

/** section 10: StudentActivityTab — "achievements, memberships, class responsibility" + "Add achievement, add membership". */
export function ActivitySection({ studentId }: { studentId: string }) {
  const staff = useAuthStore((s) => s.staff);
  const queryClient = useQueryClient();
  const achievements = useAchievements(studentId);
  const memberships = useMemberships(studentId);

  const [mode, setMode] = useState<'none' | 'achievement' | 'membership'>('none');
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState('');
  const [category, setCategory] = useState('');
  const [groupName, setGroupName] = useState('');
  const [position, setPosition] = useState('');
  const [endedOn, setEndedOn] = useState('');
  const [saving, setSaving] = useState(false);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['students', 'achievements', studentId] });
    await queryClient.invalidateQueries({ queryKey: ['students', 'memberships', studentId] });
  }

  async function submitAchievement() {
    if (!staff || !title.trim()) return;
    setSaving(true);
    try {
      await addAchievement({
        studentId,
        title: title.trim(),
        category: category.trim() || undefined,
        level: level.trim(),
        achievedOn: new Date().toISOString().slice(0, 10),
        recordedBy: staff.id,
      });
      setMode('none');
      setTitle('');
      setLevel('');
      setCategory('');
      await invalidate();
    } finally {
      setSaving(false);
    }
  }

  async function submitMembership() {
    if (!groupName.trim()) return;
    setSaving(true);
    try {
      await addMembership({
        studentId,
        groupName: groupName.trim(),
        position: position.trim(),
        startedOn: new Date().toISOString().slice(0, 10),
        endedOn: endedOn.trim() || undefined,
      });
      setMode('none');
      setGroupName('');
      setPosition('');
      setEndedOn('');
      await invalidate();
    } finally {
      setSaving(false);
    }
  }

  if (
    (achievements.data == null || achievements.data.length === 0) &&
    (memberships.data == null || memberships.data.length === 0) &&
    mode === 'none'
  ) {
    return (
      <Card>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>ACTIVITY</Text>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <Button label="Add achievement" size="sm" variant="outline" onPress={() => setMode('achievement')} />
          <Button label="Add membership" size="sm" variant="outline" onPress={() => setMode('membership')} />
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>ACTIVITY</Text>
        {mode === 'none' ? (
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <Button label="+ Achievement" size="sm" variant="ghost" onPress={() => setMode('achievement')} />
            <Button label="+ Membership" size="sm" variant="ghost" onPress={() => setMode('membership')} />
          </View>
        ) : null}
      </View>

      {mode === 'achievement' ? (
        <View style={{ gap: spacing.sm }}>
          <TextField label="Title" value={title} onChangeText={setTitle} />
          <TextField label="Category (e.g. sports, arts, academic)" value={category} onChangeText={setCategory} />
          <TextField label="Level (e.g. class, school, zonal, national)" value={level} onChangeText={setLevel} />
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <Button label="Save" size="sm" onPress={() => void submitAchievement()} loading={saving} />
            <Button label="Cancel" size="sm" variant="ghost" onPress={() => setMode('none')} />
          </View>
        </View>
      ) : null}

      {mode === 'membership' ? (
        <View style={{ gap: spacing.sm }}>
          <TextField label="Group name (club, team, society or house)" value={groupName} onChangeText={setGroupName} />
          <TextField label="Position (optional)" value={position} onChangeText={setPosition} />
          <TextField label="Ended on (optional, YYYY-MM-DD)" value={endedOn} onChangeText={setEndedOn} placeholder="leave blank if current" />
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <Button label="Save" size="sm" onPress={() => void submitMembership()} loading={saving} />
            <Button label="Cancel" size="sm" variant="ghost" onPress={() => setMode('none')} />
          </View>
        </View>
      ) : null}

      {achievements.data?.map((a) => (
        <View key={a.id} style={{ paddingVertical: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Icon name="trophy-outline" size={16} color={semantic.textPrimary} />
            <Text style={{ ...typography.body, color: semantic.textPrimary }}>{a.title}</Text>
          </View>
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
            {[a.level, a.category, a.achievedOn].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ))}
      {memberships.data?.map((m) => (
        <View key={m.id} style={{ paddingVertical: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Icon name="people-outline" size={16} color={semantic.textPrimary} />
            <Text style={{ ...typography.body, color: semantic.textPrimary }}>{m.groupName}</Text>
          </View>
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
            {[m.position, m.startedOn ? `${m.startedOn.slice(0, 4)}–${m.endedOn ? m.endedOn.slice(0, 4) : 'present'}` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      ))}
    </Card>
  );
}

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Text, View } from 'react-native';
import { WidgetTile } from '@/components';
import type { OutstandingMarkSheet } from '@/features/marks/api';
import type { RootStackParamList } from '@/navigation/types';
import { colors, semantic, typography } from '@/theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const TINT = { fg: colors.warning, bg: colors.warningBg };

/** Home "Outstanding mark sheets (list)" widget — the full list, not just the count Needs Attention shows. Only rendered when there's at least one. */
export function OutstandingMarkSheetsCard({ sheets }: { sheets: OutstandingMarkSheet[] }) {
  const navigation = useNavigation<Nav>();

  return (
    <WidgetTile
      icon="document-text-outline"
      label="MARK SHEETS"
      tint={TINT}
      onPress={() => navigation.navigate('MarksReview')}
      accessory={<Text style={{ ...typography.captionStrong, color: colors.warning }}>{sheets.length}</Text>}
    >
      {sheets.slice(0, 2).map((s) => (
        <View key={`${s.classId}-${s.subjectId}-${s.termId}`}>
          <Text style={{ ...typography.caption, color: semantic.textPrimary }} numberOfLines={1}>
            {s.className} · {s.subjectName}
          </Text>
        </View>
      ))}
    </WidgetTile>
  );
}

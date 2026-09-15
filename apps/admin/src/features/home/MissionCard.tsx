import { Image, Text, View } from 'react-native';
import { Card } from '@/components';
import { radius, semantic, spacing } from '@/theme/tokens';

const MISSION_TEXT_TA =
  'சிறுவர்நேய சூழலில் அறிவு, ஆன்மீகம், ஆளுமை, ஒழுக்கம், புத்தாக்க சிந்தனை கொண்ட ஆரோக்கியமுள்ள நற்பிரஜைகளை உருவாக்குவதற்கான அடித்தளமிடல்.';

/** Home "School mission" widget — the school logo beside its Tamil mission statement. Static content, no data hook. */
export function MissionCard() {
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <Image source={require('../../../assets/icon.png')} style={{ width: 84, height: 84, borderRadius: radius.md }} resizeMode="contain" />
        <Text style={{ fontSize: 11, lineHeight: 15, fontWeight: '400', fontStyle: 'italic', color: semantic.textPrimary, flex: 1 }}>{MISSION_TEXT_TA}</Text>
      </View>
    </Card>
  );
}

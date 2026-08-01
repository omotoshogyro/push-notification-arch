import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type ViewStyle,
} from 'react-native'

export function usePalette() {
  const dark = useColorScheme() === 'dark'
  return {
    dark,
    bg: dark ? '#0b0f14' : '#f5f7fa',
    card: dark ? '#151b23' : '#ffffff',
    border: dark ? '#232c38' : '#e2e8f0',
    text: dark ? '#e8edf3' : '#0f172a',
    dim: dark ? '#8b98a8' : '#64748b',
    accent: '#1185fe',
    good: '#16a34a',
    warn: '#d97706',
    bad: '#dc2626',
  }
}

export function Card({
  title,
  children,
  style,
}: React.PropsWithChildren<{title?: string; style?: ViewStyle}>) {
  const p = usePalette()
  return (
    <View
      style={[
        styles.card,
        {backgroundColor: p.card, borderColor: p.border},
        style,
      ]}>
      {title ? (
        <Text style={[styles.cardTitle, {color: p.dim}]}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      {children}
    </View>
  )
}

export function Row({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string | number
  valueColor?: string
}) {
  const p = usePalette()
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, {color: p.dim}]}>{label}</Text>
      <Text style={[styles.rowValue, {color: valueColor ?? p.text}]}>
        {value}
      </Text>
    </View>
  )
}

export function Button({
  label,
  onPress,
  tone = 'default',
}: {
  label: string
  onPress: () => void
  tone?: 'default' | 'accent' | 'danger'
}) {
  const p = usePalette()
  const bg =
    tone === 'accent' ? p.accent : tone === 'danger' ? p.bad : 'transparent'
  const fg = tone === 'default' ? p.text : '#fff'
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({pressed}) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: tone === 'default' ? p.border : bg,
          opacity: pressed ? 0.6 : 1,
        },
      ]}>
      <Text style={[styles.buttonText, {color: fg}]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 6,
    marginBottom: 12,
  },
  cardTitle: {fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4},
  row: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3},
  rowLabel: {fontSize: 14},
  rowValue: {fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums']},
  button: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    flexGrow: 1,
  },
  buttonText: {fontSize: 14, fontWeight: '600'},
})

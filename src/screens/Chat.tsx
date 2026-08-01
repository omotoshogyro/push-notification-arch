import {ScrollView, Text} from 'react-native'

import {type NotificationPayload} from '../notifications/routing'
import {Card, usePalette} from '../ui'

export function ChatScreen({payload}: {payload?: NotificationPayload}) {
  const p = usePalette()
  return (
    <ScrollView
      style={{backgroundColor: p.bg}}
      contentContainerStyle={{padding: 16}}>
      <Card title="Routed from a chat notification">
        <Text style={{color: p.text, fontSize: 15, fontWeight: '600'}}>
          {payload?.senderDisplayName ?? 'No conversation opened'}
        </Text>
        <Text style={{color: p.dim, fontSize: 12, marginTop: 4}}>
          convoId: {payload?.convoId ?? '—'}
        </Text>
        <Text style={{color: p.dim, fontSize: 12, marginTop: 10}}>
          Tapping a chat-message notification lands here rather than on the
          Notifications tab. Chat pushes also deliberately skip the badge: they
          are counted by the conversation list, not the notifications tab.
        </Text>
      </Card>
    </ScrollView>
  )
}

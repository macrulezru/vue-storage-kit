import { ref, shallowRef, getCurrentScope, onScopeDispose, type Ref, type ShallowRef } from 'vue'

export interface UseBroadcastChannelReturn<T> {
  isSupported: boolean
  lastMessage: ShallowRef<T | null>
  messages: Ref<T[]>
  post(message: T): void
  close(): void
}

export function useBroadcastChannel<T>(channelName: string): UseBroadcastChannelReturn<T> {
  const isSupported = typeof BroadcastChannel !== 'undefined'
  const lastMessage = shallowRef<T | null>(null)
  const messages = ref<T[]>([]) as Ref<T[]>

  let channel: BroadcastChannel | null = null

  if (isSupported) {
    channel = new BroadcastChannel(channelName)
    channel.addEventListener('message', (event: MessageEvent<T>) => {
      lastMessage.value = event.data
      messages.value = [...messages.value, event.data]
    })
  }

  function post(message: T): void {
    channel?.postMessage(message)
  }

  function close(): void {
    channel?.close()
    channel = null
  }

  if (getCurrentScope()) {
    onScopeDispose(close)
  }

  return { isSupported, lastMessage, messages, post, close }
}

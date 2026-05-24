<script setup lang="ts">
import { ref } from 'vue'
import { useStorageList } from 'vue-storage-kit'

interface Todo {
  id: string
  text: string
  done: boolean
}

const { items, add, update, remove, clear } = useStorageList<Todo>('demo:todos', {
  keyField: 'id',
  target: 'local',
})

const newText = ref('')
let _id = 0

function addTodo() {
  if (!newText.value.trim()) return
  add({ id: `t${Date.now()}-${_id++}`, text: newText.value.trim(), done: false })
  newText.value = ''
}

function toggleDone(id: string, done: boolean) {
  update(id, { done: !done })
}
</script>

<template>
  <div>
    <h2 class="section-title">📋 Storage list</h2>
    <p class="section-desc">
      <code>useStorageList&lt;T&gt;</code> manages a reactive CRUD collection stored as a single JSON array.
      Items are keyed by a configurable <code>keyField</code> (default: <code>"id"</code>).
    </p>

    <div class="card">
      <div class="card-title">To-do list — persisted in localStorage</div>
      <div class="row">
        <input
          v-model="newText"
          type="text"
          placeholder="New task…"
          style="flex:1"
          @keydown.enter="addTodo"
        />
        <button @click="addTodo">Add</button>
        <button class="danger ghost sm" @click="clear">Clear all</button>
      </div>
      <div class="divider" />
      <div v-if="items.length === 0" style="color:var(--muted);font-size:0.82rem">
        No tasks yet — add one above.
      </div>
      <div
        v-for="item in items"
        :key="item.id"
        class="todo-item"
        :class="{ done: item.done }"
      >
        <input
          type="checkbox"
          :checked="item.done"
          @change="toggleDone(item.id, item.done)"
        />
        <span style="flex:1">{{ item.text }}</span>
        <button class="danger sm" @click="remove(item.id)">✕</button>
      </div>
      <p style="font-size:0.78rem;color:var(--muted);margin-top:0.75rem">
        {{ items.filter(t => t.done).length }} / {{ items.length }} done · Reload the page — list persists.
      </p>
    </div>

    <div class="card">
      <div class="card-title">Code</div>
      <pre>const { items, add, update, remove, clear } = useStorageList&lt;Todo&gt;('demo:todos', {
  keyField: 'id',   // field used as unique key
})

add({ id: '1', text: 'Buy milk', done: false })
update('1', { done: true })
remove('1')</pre>
    </div>
  </div>
</template>

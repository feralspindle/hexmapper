<template>
  <div class="min-h-screen bg-stone-900 flex items-center justify-center">
    <div class="text-center">
      <div class="text-5xl mb-4">⬡</div>
      <p class="text-parchment-200 font-display text-lg">
        {{ error ? 'Login failed' : 'Logging you in...' }}
      </p>
      <p v-if="error" class="text-red-400 text-sm mt-2">{{ error }}</p>
      <button
        v-if="error"
        class="mt-4 text-stone-400 hover:text-stone-200 text-sm underline"
        @click="router.push('/')"
      >
        Back to home
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

const router = useRouter()
const error = ref(null)

onMounted(async () => {
  const { data, error: err } = await supabase.auth.getSession()
  if (err) {
    error.value = err.message
    return
  }

  const userId = data.session?.user?.id
  if (userId) {
    const [ownedRes, joinedRes] = await Promise.all([
      supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('owner_id', userId),
      supabase.from('session_members').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    ])
    if (ownedRes.error || joinedRes.error) {
      error.value = 'Could not verify your account. Check your connection (an ad blocker may be blocking requests) and try again.'
      return
    }
    if (!ownedRes.count && !joinedRes.count) {
      await supabase.auth.signOut()
      error.value = 'Sign-ups are currently closed.'
      return
    }
  }

  router.replace('/')
})
</script>

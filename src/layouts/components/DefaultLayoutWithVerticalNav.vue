<script lang="ts" setup>
import adminNavItems from '@/navigation/vertical'
import deanNavItems from '@/navigation/vertical/dean'
import studentNavItems from '@/navigation/vertical/student'

// Components
import Footer from '@/layouts/components/Footer.vue'
import UserProfile from '@/layouts/components/UserProfile.vue'

// @layouts plugin
import { VerticalNavLayout } from '@layouts'

// Store cookie ref once to ensure proper reactivity
const userDataCookie = useCookie<any>('userData')

// Get navigation items based on user role - directly computed from cookie
const navItems = computed(() => {
  const userData = userDataCookie.value

  // Return empty array if not authenticated (prevents nav showing during logout)
  if (!userData) {
    return []
  }

  // Handle different role formats
  let role = ''
  if (userData?.role) {
    if (typeof userData.role === 'string') {
      role = userData.role.toLowerCase()
    }
    else if (typeof userData.role === 'object') {
      role = (userData.role.name || userData.role.title || '').toLowerCase()
    }
  }

  // Also check for direct role property
  if (!role && userData?.userRole) {
    role = userData.userRole.toLowerCase()
  }

  if (role === 'dean') {
    return deanNavItems
  }
  else if (role === 'student') {
    return studentNavItems
  }

  // Default to admin navigation
  return adminNavItems
})

// Check if authenticated for conditional rendering
const isAuthenticated = computed(() => !!userDataCookie.value)
</script>

<template>
  <VerticalNavLayout
    v-if="isAuthenticated"
    :nav-items="navItems"
  >
    <!-- 👉 navbar -->
    <template #navbar="{ toggleVerticalOverlayNavActive }">
      <div class="d-flex h-100 align-center">
        <IconBtn
          id="vertical-nav-toggle-btn"
          class="ms-n2 d-lg-none"
          @click="toggleVerticalOverlayNavActive(true)"
        >
          <VIcon icon="ri-menu-line" />
        </IconBtn>

        <VSpacer />

        <UserProfile />
      </div>
    </template>

    <!-- 👉 Pages -->
    <slot />

    <!-- 👉 Footer -->
    <template #footer>
      <Footer />
    </template>
  </VerticalNavLayout>

  <!-- Fallback when not authenticated (during logout transition) -->
  <div v-else class="layout-wrapper">
    <slot />
  </div>
</template>

<script setup lang="ts">
const router = useRouter()
const ability = useAbility()

const userData = useCookie<any>('userData')

// Computed property for user's full name
const userFullName = computed(() => {
  if (!userData.value)
    return ''

  const firstName = userData.value.first_name || ''
  const lastName = userData.value.last_name || ''

  return `${firstName} ${lastName}`.trim() || userData.value.email || 'User'
})

// Computed property for user's role
const userRole = computed(() => {
  return userData.value?.role?.name || 'User'
})

const logout = async () => {
  // Remove tokens from cookies
  useCookie('accessToken').value = null
  useCookie('refreshToken').value = null

  // Remove userData from cookie
  userData.value = null

  // Remove userAbilities from cookie
  useCookie('userAbilityRules').value = null

  // Remove remember me preference
  useCookie('rememberMe').value = null

  // Reset ability to initial ability
  ability.update([])

  // Redirect to login page
  await router.push('/login')
}
</script>

<template>
  <VAvatar
    v-if="userData"
    class="cursor-pointer"
    size="38"
    :color="!userData.avatar ? 'primary' : undefined"
    :variant="!userData.avatar ? 'tonal' : undefined"
  >
    <VImg
      v-if="userData.avatar"
      :src="userData.avatar"
    />
    <VIcon
      v-else
      icon="ri-user-line"
    />

    <!-- Menu -->
    <VMenu
      activator="parent"
      width="250"
      location="bottom end"
      offset="10px"
    >
      <VCard>
        <VCardText class="d-flex align-center gap-3 pa-4">
          <VAvatar
            size="48"
            :color="!userData.avatar ? 'primary' : undefined"
            :variant="!userData.avatar ? 'tonal' : undefined"
          >
            <VImg
              v-if="userData.avatar"
              :src="userData.avatar"
            />
            <VIcon
              v-else
              icon="ri-user-line"
              size="28"
            />
          </VAvatar>

          <div>
            <h6 class="text-h6 font-weight-medium">
              {{ userFullName }}
            </h6>
            <span class="text-body-2 text-medium-emphasis text-capitalize">
              {{ userRole }}
            </span>
          </div>
        </VCardText>

        <VDivider />

        <VList class="pa-2">
          <VListItem
            :to="{ name: 'profile' }"
            class="mb-1"
          >
            <template #prepend>
              <VIcon
                icon="ri-user-settings-line"
                class="me-2"
              />
            </template>
            <VListItemTitle>Profile</VListItemTitle>
          </VListItem>
        </VList>

        <VDivider />

        <VCardActions class="pa-3">
          <VBtn
            block
            color="error"
            variant="tonal"
            prepend-icon="ri-logout-box-r-line"
            @click="logout"
          >
            Logout
          </VBtn>
        </VCardActions>
      </VCard>
    </VMenu>
  </VAvatar>
</template>

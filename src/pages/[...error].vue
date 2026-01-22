<script setup lang="ts">

definePage({
  alias: '/pages/misc/not-found/:error(.*)',
  meta: {
    layout: 'blank',
    public: true,
  },
})
</script>

<template>
  <div class="d-flex justify-center align-center h-screen bg-grey-lighten-3">
    <VCard
      class="pa-6 pa-sm-10 text-center"
      max-width="400"
      elevation="8"
    >
      <VIcon
        icon="ri-alert-fill"
        size="48"
        color="error"
        class="mb-4"
      />

      <h4 class="text-h6 font-weight-bold mb-2">
        404 - Page Not Found
      </h4>

      <p class="text-body-2 text-wrap mb-4">
        Oops! The page you're looking for doesn't exist or has been moved.
      </p>

      <VBtn
        to="/"
        color="warning"
        block
        class="mt-1"
      >
        <VIcon
          start
          icon="mdi-arrow-left"
        />
        Back to Home
      </VBtn>
    </VCard>
  </div>
</template>


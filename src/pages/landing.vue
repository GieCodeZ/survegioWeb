<script setup lang="ts">
import { themeConfig } from '@themeConfig'
import { VNodeRenderer } from '@layouts/components/VNodeRenderer'
import bgImage from '@images/cct2.png'
import cctImage from '@images/cct.png'

definePage({
  meta: {
    layout: 'blank',
    public: true,
  },
})

const router = useRouter()
const ability = useAbility()

const goToLogin = async () => {
  // Clear any existing session to ensure we can access login page
  useCookie('accessToken').value = null
  useCookie('userData').value = null
  useCookie('userAbilityRules').value = null
  ability.update([])

  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="landing-page">
    <!-- Hero Section with Background -->
    <div
      id="home"
      class="hero-wrapper"
      :style="{ backgroundImage: `url(${bgImage})` }"
    >
      <!-- Primary Color Overlay -->
      <div class="hero-overlay" />

      <!-- Navigation -->
      <VAppBar
        flat
        color="transparent"
        class="px-4 position-relative"
        style="z-index: 2;"
      >
        <div class="d-flex align-center gap-x-3">
          <VNodeRenderer :nodes="themeConfig.app.logo" />
          <div class="d-flex flex-column">
            <span class="text-h5 font-weight-bold text-primary">
              {{ themeConfig.app.title }}
            </span>
            <span class="text-caption text-primary" style="opacity: 0.9; margin-top: -2px;">
              Performance Evaluation
            </span>
          </div>
        </div>

        <VSpacer />

        <VBtn
          variant="text"
          class="text-white"
          href="#home"
        >
          Home
        </VBtn>
        <VBtn
          variant="text"
          class="text-white"
          href="#about"
        >
          About
        </VBtn>
        <VBtn
          color="secondary"
          class="text-primary font-weight-bold"
          rounded="pill"
          @click="goToLogin"
        >
          Login
        </VBtn>
      </VAppBar>

      <!-- Hero Content -->
      <VContainer class="hero-section position-relative" style="z-index: 2;">
        <VRow
          align="center"
          justify="center"
          class="min-h-screen"
        >
          <VCol
            cols="12"
            md="8"
            class="text-center"
          >
            <h1 class="text-h2 text-md-h1 font-weight-bold mb-4 text-white text-no-wrap">
              Empowering Student Voices
            </h1>
            <p class="text-h6 mb-6 mx-auto text-white" style="max-width: 600px; opacity: 0.9;">
              Your feedback helps shape a better learning experience.
            </p>
            <VBtn
              size="x-large"
              color="secondary"
              class="text-primary font-weight-bold"
              rounded="pill"
              @click="goToLogin"
            >
              Get Started
            </VBtn>
          </VCol>
        </VRow>
      </VContainer>
    </div>

    <!-- Features Section -->
    <VContainer class="py-16">
      <VRow justify="center" class="mb-12">
        <VCol cols="12" class="text-center">
          <h2 class="text-h3 font-weight-bold mb-4">Why Choose Survegio?</h2>
          <p class="text-body-1 text-medium-emphasis">Everything you need to create and manage surveys effectively</p>
        </VCol>
      </VRow>

      <VRow>
        <VCol
          v-for="feature in features"
          :key="feature.title"
          cols="12"
          sm="6"
          md="3"
        >
          <VCard
            flat
            class="pa-6 text-center h-100"
            color="grey-50"
          >
            <VIcon
              :icon="feature.icon"
              size="48"
              color="primary"
              class="mb-4"
            />
            <h3 class="text-h5 font-weight-bold mb-2">{{ feature.title }}</h3>
            <p class="text-body-2 text-medium-emphasis">{{ feature.description }}</p>
          </VCard>
        </VCol>
      </VRow>
    </VContainer>

    <!-- About Us Section -->
    <div id="about" class="about-section py-16" style="background-color: #f5f5f5;">
      <VContainer>
        <VRow align="center">
          <VCol cols="12" md="6">
            <h2 class="text-h3 font-weight-bold mb-4 text-primary">About Us</h2>
            <p class="text-body-1 text-medium-emphasis">
              Survegio is an academic evaluation platform designed to gather meaningful student feedback. Our mission is to provide schools with clear insights while empowering students to share their voices in shaping education for the better.
            </p>
          </VCol>
          <VCol cols="12" md="6" class="d-flex justify-center">
            <VImg
              :src="cctImage"
              max-width="400"
              class="rounded-lg"
            />
          </VCol>
        </VRow>
      </VContainer>
    </div>

    <!-- Footer -->
    <div class="footer-section py-12" style="background-color: rgb(var(--v-theme-primary));">
      <VContainer>
        <VRow>
          <VCol cols="12" md="6" class="d-flex align-center gap-x-3 mb-6 mb-md-0">
            <VNodeRenderer :nodes="themeConfig.app.logo" />
            <div class="d-flex flex-column">
              <span class="text-h5 font-weight-bold text-white">
                {{ themeConfig.app.title }}
              </span>
              <span class="text-caption text-white" style="opacity: 0.8;">
                Smarter Surveys. Better Insights.
              </span>
            </div>
          </VCol>
          <VCol cols="12" md="6" class="d-flex flex-column align-md-end">
            <div class="d-flex align-center gap-x-2 mb-2">
              <VIcon icon="ri-mail-line" color="white" size="18" />
              <span class="text-body-2 text-white">support@survegio.com</span>
            </div>
            <div class="d-flex align-center gap-x-2">
              <VIcon icon="ri-phone-line" color="white" size="18" />
              <span class="text-body-2 text-white">+63 912 345 6789</span>
            </div>
          </VCol>
        </VRow>
        <VDivider class="my-6" style="opacity: 0.3;" color="white" />
        <VRow>
          <VCol cols="12" class="d-flex flex-column flex-md-row justify-space-between align-center">
            <p class="text-body-2 text-white mb-2 mb-md-0">
              &copy; {{ new Date().getFullYear() }} Survegio
            </p>
            <p class="text-body-2 text-white" style="opacity: 0.8;">
              Made with Lucky Me Pancit Canton
            </p>
          </VCol>
        </VRow>
      </VContainer>
    </div>
  </div>
</template>

<script lang="ts">
const features = [
  {
    icon: 'ri-spy-line',
    title: 'Anonymity',
    description: 'Your responses are completely anonymous. No personal identity is linked.',
  },
  {
    icon: 'ri-shield-check-line',
    title: 'Data Security',
    description: 'Your feedback is securely stored with top-level protection.',
  },
  {
    icon: 'ri-school-line',
    title: 'CCT Focused',
    description: 'Specially designed for Tayabas City College students.',
  },
  {
    icon: 'ri-lightbulb-line',
    title: 'Actionable Insights',
    description: 'Quality feedback that drives meaningful improvements.',
  },
]

export default {
  data() {
    return { features }
  },
}
</script>

<style lang="scss" scoped>
.landing-page {
  min-height: 100vh;
  background-color: rgb(var(--v-theme-background));
}

.hero-wrapper {
  position: relative;
  min-height: 100vh;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background-color: rgb(var(--v-theme-primary));
  opacity: 0.85;
  z-index: 1;
}

.hero-section {
  min-height: calc(100vh - 64px);
  display: flex;
  align-items: center;
}

.border-white {
  border-color: #fff !important;
}
</style>

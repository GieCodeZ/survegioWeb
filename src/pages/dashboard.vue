<script setup lang="ts">
import VueApexCharts from 'vue3-apexcharts'
import { useTheme } from 'vuetify'
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'Dashboard',
    allowedRoles: ['administrator'],
  },
})

interface AcademicTerm {
  id: number
  schoolYear: string
  semester: string
  status: string
}


// State
const isLoading = ref(true)
const stats = ref<{
  totalStudents: number | null
  totalTeachers: number | null
  totalClasses: number | null
  totalDepartments: number | null
  totalSurveys: number | null
  activeSurveys: number | null
  totalResponses: number | null
}>({
  totalStudents: null,
  totalTeachers: null,
  totalClasses: null,
  totalDepartments: null,
  totalSurveys: null,
  activeSurveys: null,
  totalResponses: null,
})

const currentTerm = ref<AcademicTerm | null>(null)
const completionStats = ref<{
  completed: number | null
  pending: number | null
}>({
  completed: null,
  pending: null,
})

const vuetifyTheme = useTheme()

// Pie Chart options for completion status
const chartOptions = computed(() => {
  const isDark = vuetifyTheme.current.value.dark

  return {
    chart: {
      type: 'pie',
      background: 'transparent',
    },
    labels: ['Completed', 'Pending'],
    colors: ['#28C76F', '#FF9F43'],
    dataLabels: {
      enabled: true,
      formatter: (val: number) => `${val.toFixed(1)}%`,
      style: {
        fontSize: '14px',
        fontWeight: 'bold',
      },
      dropShadow: { enabled: false },
    },
    legend: {
      position: 'bottom',
      labels: {
        colors: isDark ? '#b4b7bd' : '#6e6b7b',
      },
    },
    tooltip: {
      theme: isDark ? 'dark' : 'light',
      y: {
        formatter: (val: number) => `${val} responses`,
      },
    },
    stroke: {
      width: 2,
      colors: [isDark ? '#25293c' : '#ffffff'],
    },
    plotOptions: {
      pie: {
        donut: {
          size: '0%',
        },
      },
    },
    responsive: [{
      breakpoint: 480,
      options: {
        chart: { width: 280 },
        legend: { position: 'bottom' },
      },
    }],
  }
})

const chartSeries = computed(() => [
  completionStats.value.completed,
  completionStats.value.pending,
])

// Fetch all dashboard data
const fetchDashboardData = async () => {
  isLoading.value = true
  try {
    await Promise.all([
      fetchStats(),
      fetchCurrentTerm(),
      fetchCompletionStats(),
    ])
  }
  catch (error) {
    console.error('Failed to fetch dashboard data:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Fetch counts
const fetchStats = async () => {
  try {
    // Fetch students count
    const studentsRes = await $api('/items/students', {
      params: { aggregate: { count: '*' } },
    })
    stats.value.totalStudents = studentsRes.data?.[0]?.count

    // Fetch teachers count
    const teachersRes = await $api('/items/Teachers', {
      params: { aggregate: { count: '*' } },
    })
    stats.value.totalTeachers = teachersRes.data?.[0]?.count

    // Fetch classes count
    const classesRes = await $api('/items/classes', {
      params: { aggregate: { count: '*' } },
    })
    stats.value.totalClasses = classesRes.data?.[0]?.count

    // Fetch departments count
    const departmentsRes = await $api('/items/Department', {
      params: { aggregate: { count: '*' } },
    })
    stats.value.totalDepartments = departmentsRes.data?.[0]?.count

    // Student Surveys
    const studentSurveysRes = await $api('/items/StudentEvaluationSurvey', {
      params: { aggregate: { count: '*' } },
    })
    const studentSurveyCount = studentSurveysRes.data?.[0]?.count

    const activeStudentSurveysRes = await $api('/items/StudentEvaluationSurvey', {
      params: {
        filter: { is_active: { _eq: 'Active' } },
        aggregate: { count: '*' },
      },
    })
    const activeStudentCount = activeStudentSurveysRes.data?.[0]?.count

    const studentResponsesRes = await $api('/items/StudentSurveyResponses', {
      params: { aggregate: { count: '*' } },
    })
    const studentResponseCount = studentResponsesRes.data?.[0]?.count

    // Dean Evaluations
    let deanSurveyCount: number | undefined
    let activeDeanCount: number | undefined
    let deanResponseCount: number | undefined

    try {
      const deanSurveysRes = await $api('/items/DeanEvaluationSurvey', {
        params: { aggregate: { count: '*' } },
      })
      deanSurveyCount = deanSurveysRes.data?.[0]?.count

      const activeDeanSurveysRes = await $api('/items/DeanEvaluationSurvey', {
        params: {
          filter: { is_active: { _eq: 'Active' } },
          aggregate: { count: '*' },
        },
      })
      activeDeanCount = activeDeanSurveysRes.data?.[0]?.count

      const deanResponsesRes = await $api('/items/DeanSurveyResponses', {
        params: { aggregate: { count: '*' } },
      })
      deanResponseCount = deanResponsesRes.data?.[0]?.count
    }
    catch {
      // Dean collections might not exist yet
    }

    // Combined totals
    stats.value.totalSurveys = studentSurveyCount + deanSurveyCount
    stats.value.activeSurveys = activeStudentCount + activeDeanCount
    stats.value.totalResponses = studentResponseCount + deanResponseCount
  }
  catch (error) {
    console.error('Failed to fetch stats:', error)
  }
}

// Fetch current academic term
const fetchCurrentTerm = async () => {
  try {
    const res = await $api('/items/academicTerms', {
      params: {
        filter: { status: { _eq: 'Active' } },
        limit: 1,
      },
    })
    currentTerm.value = res.data?.[0]
  }
  catch (error) {
    console.error('Failed to fetch current term:', error)
  }
}

// Fetch completion stats for pie chart
const fetchCompletionStats = async () => {
  try {
    // Get active student surveys with their expected respondents
    const surveysRes = await $api('/items/StudentEvaluationSurvey', {
      params: {
        filter: { is_active: { _eq: 'Active' } },
        fields: ['id', 'classes.classes_id.student_id', 'students.students_id'],
      },
    })

    let totalExpected = 0
    for (const survey of surveysRes.data || []) {
      // Count from classes
      if (survey.classes && Array.isArray(survey.classes)) {
        for (const classItem of survey.classes) {
          if (classItem.classes_id?.student_id) {
            totalExpected += Array.isArray(classItem.classes_id.student_id)
              ? classItem.classes_id.student_id.length
              : 0
          }
        }
      }
      // Count from direct student assignments
      if (survey.students && Array.isArray(survey.students)) {
        totalExpected += survey.students.length
      }
    }

    // Get completed responses
    const responsesRes = await $api('/items/StudentSurveyResponses', {
      params: { aggregate: { count: '*' } },
    })
    const completed = responsesRes.data?.[0]?.count

    completionStats.value = {
      completed: completed ?? null,
      pending: completed != null ? Math.max(0, totalExpected - completed) : null,
    }
  }
  catch (error) {
    console.error('Failed to fetch completion stats:', error)
  }
}

onMounted(() => {
  fetchDashboardData()
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h4 class="text-h4 mb-1">Dashboard</h4>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Welcome to Survegio
        </p>
      </div>
      <VChip v-if="currentTerm" color="primary" variant="tonal" size="large">
        <VIcon icon="ri-calendar-line" class="me-1" />
        {{ currentTerm.semester }} {{ currentTerm.schoolYear }}
      </VChip>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="d-flex justify-center align-center pa-12">
      <VProgressCircular indeterminate color="primary" size="48" />
    </div>

    <template v-else>
      <!-- Stats Cards -->
      <VRow class="mb-6">
        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="primary" variant="tonal" rounded>
                <VIcon icon="ri-user-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.totalStudents }}</div>
                <div class="text-caption text-medium-emphasis">Students</div>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="success" variant="tonal" rounded>
                <VIcon icon="ri-user-star-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.totalTeachers }}</div>
                <div class="text-caption text-medium-emphasis">Teachers</div>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="info" variant="tonal" rounded>
                <VIcon icon="ri-survey-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.totalSurveys }}</div>
                <div class="text-caption text-medium-emphasis">
                  Surveys
                  <span class="text-success">({{ stats.activeSurveys }} active)</span>
                </div>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="6" md="3">
          <VCard>
            <VCardText class="d-flex align-center gap-3">
              <VAvatar size="44" color="warning" variant="tonal" rounded>
                <VIcon icon="ri-file-list-3-line" size="24" />
              </VAvatar>
              <div>
                <div class="text-h5 font-weight-bold">{{ stats.totalResponses }}</div>
                <div class="text-caption text-medium-emphasis">Responses</div>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <!-- Survey Completion Status Pie Chart -->
      <VRow class="mb-6">
        <VCol cols="12" md="6">
          <VCard>
            <VCardTitle class="d-flex align-center pa-5">
              <VIcon icon="ri-pie-chart-line" class="me-2" />
              Survey Completion Status
            </VCardTitle>

            <VDivider />

            <VCardText class="pa-4 d-flex justify-center">
              <VueApexCharts
                type="pie"
                height="320"
                width="400"
                :options="chartOptions"
                :series="chartSeries"
              />
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

    </template>
  </div>
</template>


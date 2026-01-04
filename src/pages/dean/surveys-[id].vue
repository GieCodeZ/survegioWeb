<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'DeanSurveys',
    allowedRoles: ['dean'],
  },
})

interface DeanQuestion {
  id: number
  question: string
  sort?: number
}

interface DeanQuestionGroup {
  id: number
  number: number
  title: string
  response_style: string
  questions?: DeanQuestion[]
}

interface DeanSurvey {
  id: number
  title: string
  instruction?: string
  evaluation_type?: 'class' | 'office'
  question_groups?: DeanQuestionGroup[]
}

interface Teacher {
  id: number
  first_name: string
  last_name: string
}

const route = useRoute()
const router = useRouter()

const surveyId = computed(() => Number(route.params.id))
const teacherId = computed(() => {
  const id = route.query.teacher
  return id ? Number(id) : null
})

const isLoading = ref(true)
const isSubmitting = ref(false)
const survey = ref<DeanSurvey | null>(null)
const teacher = ref<Teacher | null>(null)
const answers = ref<Record<number, string>>({})

const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

// Get all questions as flat array with response style
const allQuestions = computed(() => {
  if (!survey.value?.question_groups) return []
  const questions: { question: DeanQuestion; groupTitle: string; responseStyle: string }[] = []
  for (const group of survey.value.question_groups) {
    console.log('Question group response_style:', group.response_style)
    for (const q of group.questions || []) {
      questions.push({
        question: q,
        groupTitle: group.title,
        responseStyle: group.response_style,
      })
    }
  }
  return questions
})

// Helper to check response style (case-insensitive, partial match)
const isResponseStyle = (responseStyle: string, type: string): boolean => {
  if (!responseStyle) return false
  const lower = responseStyle.toLowerCase()
  return lower.includes(type.toLowerCase())
}

// Get answer options based on response style and evaluation type
const getAnswerOptions = (responseStyle: string) => {
  const isOfficeBased = survey.value?.evaluation_type === 'office'

  // Office-based rating labels
  const officeRatingOptions = [
    { value: '5', label: '5 - Outstanding' },
    { value: '4', label: '4 - Very Satisfactory' },
    { value: '3', label: '3 - Satisfactory' },
    { value: '2', label: '2 - Unsatisfactory' },
    { value: '1', label: '1 - Poor' },
  ]

  // Class-based rating labels (default)
  const classRatingOptions = [
    { value: '5', label: '5 - Always manifested' },
    { value: '4', label: '4 - Often manifested' },
    { value: '3', label: '3 - Sometimes manifested' },
    { value: '2', label: '2 - Seldom manifested' },
    { value: '1', label: '1 - Never/Rarely manifested' },
  ]

  switch (responseStyle) {
    case 'Likert-Scale Questions':
      return isOfficeBased ? officeRatingOptions : classRatingOptions
    case 'Rating-Scale Questions':
      return isOfficeBased ? officeRatingOptions : classRatingOptions
    case 'Yes or No':
      return [
        { value: 'Yes', label: 'Yes' },
        { value: 'No', label: 'No' },
      ]
    default:
      return []
  }
}

// Fetch teacher info
const fetchTeacher = async () => {
  if (!teacherId.value) {
    teacher.value = null
    return
  }
  try {
    const res = await $api(`/items/Teachers/${teacherId.value}`, {
      params: {
        fields: ['id', 'first_name', 'last_name'],
      },
    })
    teacher.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch teacher:', error)
    teacher.value = null
  }
}

// Fetch survey
const fetchSurvey = async () => {
  isLoading.value = true
  try {
    const [surveyRes] = await Promise.all([
      $api(`/items/DeanEvaluationSurvey/${surveyId.value}`, {
        params: {
          fields: ['*', 'question_groups.*', 'question_groups.questions.*'],
        },
      }),
      fetchTeacher(),
    ])
    survey.value = surveyRes.data
  }
  catch (error) {
    console.error('Failed to fetch survey:', error)
    snackbar.value = { show: true, message: 'Failed to load survey', color: 'error' }
  }
  finally {
    isLoading.value = false
  }
}

// Submit response (two-step approach like student page)
const submitResponse = async () => {
  // Validate all questions are answered
  const unanswered = allQuestions.value.filter(q => !answers.value[q.question.id])
  if (unanswered.length > 0) {
    snackbar.value = { show: true, message: `Please answer all questions (${unanswered.length} remaining)`, color: 'error' }
    return
  }

  isSubmitting.value = true
  try {
    const userData = useCookie('userData').value as any
    const deanId = userData?.dean_id

    if (!deanId) {
      snackbar.value = { show: true, message: 'Dean ID not found. Please logout and login again.', color: 'error' }
      return
    }

    // Step 1: Create the response first (without nested answers)
    const responseBody: any = {
      survey_id: surveyId.value,
      dean_id: deanId,
      submitted_at: new Date().toISOString(),
    }

    // Include evaluated teacher if this is a faculty evaluation
    if (teacherId.value) {
      responseBody.evaluated_teached_id = teacherId.value
    }

    const responseRes = await $api('/items/DeanSurveyResponses', {
      method: 'POST',
      body: responseBody,
    })

    const responseId = responseRes.data.id

    // Step 2: Create answers separately with response_id
    const answersData = Object.entries(answers.value).map(([questionId, answerValue]) => ({
      response_id: responseId,
      question_id: Number(questionId),
      answer_value: answerValue,
    }))

    await $api('/items/DeanSurveyAnswer', {
      method: 'POST',
      body: answersData,
    })

    snackbar.value = { show: true, message: 'Evaluation submitted successfully!', color: 'success' }

    // Go back to surveys list after short delay
    setTimeout(() => {
      router.push('/dean/surveys')
    }, 1500)
  }
  catch (error: any) {
    console.error('Failed to submit response:', error)
    console.error('Error details:', error?.data)
    let errorMessage = 'Failed to submit evaluation.'
    if (error?.data?.errors?.[0]?.extensions?.code === 'FORBIDDEN') {
      errorMessage = 'Permission denied. Please contact administrator to enable Create permission on DeanSurveyResponses and DeanSurveyAnswer.'
    }
    else if (error?.data?.errors?.[0]?.message) {
      errorMessage = error.data.errors[0].message
    }
    snackbar.value = { show: true, message: errorMessage, color: 'error' }
  }
  finally {
    isSubmitting.value = false
  }
}

const goBack = () => {
  router.push('/dean/surveys')
}

onMounted(() => {
  fetchSurvey()
})
</script>

<template>
  <div>
    <!-- Loading -->
    <VCard v-if="isLoading">
      <VCardText class="text-center pa-12">
        <VProgressCircular indeterminate color="primary" />
        <p class="mt-4">Loading survey...</p>
      </VCardText>
    </VCard>

    <!-- Survey Form -->
    <template v-else-if="survey">
      <VCard>
        <VCardTitle class="d-flex align-center pa-4">
          <VBtn icon variant="text" @click="goBack">
            <VIcon icon="ri-arrow-left-line" />
          </VBtn>
          <span class="ms-2">{{ survey.title }}</span>
        </VCardTitle>

        <VDivider />

        <VCardText>
          <!-- Teacher being evaluated -->
          <VAlert
            v-if="teacher"
            type="info"
            variant="tonal"
            class="mb-4"
          >
            <template #title>Evaluating Faculty Member</template>
            <strong>{{ teacher.first_name }} {{ teacher.last_name }}</strong>
          </VAlert>

          <p v-if="survey.instruction" class="text-body-2 text-medium-emphasis mb-6">
            <strong>Instructions:</strong> {{ survey.instruction }}
          </p>

          <!-- Question Groups -->
          <div
            v-for="(group, groupIndex) in survey.question_groups"
            :key="group.id"
            class="mb-6"
          >
            <!-- Group Title -->
            <h6 class="text-h6 mb-4">{{ group.title }}</h6>

            <!-- Questions in this group -->
            <VCard
              v-for="(question, qIndex) in group.questions"
              :key="question.id"
              variant="outlined"
              class="mb-4"
            >
              <VCardText>
                <p class="font-weight-medium text-body-1 mb-4">{{ qIndex + 1 }}. {{ question.question }}</p>

                <!-- Likert Scale - Radio buttons -->
                <VRadioGroup
                  v-if="isResponseStyle(group.response_style, 'likert')"
                  v-model="answers[question.id]"
                  class="ms-2"
                >
                  <VRadio
                    v-for="option in getAnswerOptions('Likert-Scale Questions')"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                    density="comfortable"
                    class="mb-1"
                  />
                </VRadioGroup>

                <!-- Rating Scale - Radio buttons -->
                <VRadioGroup
                  v-else-if="isResponseStyle(group.response_style, 'rating')"
                  v-model="answers[question.id]"
                  class="ms-2"
                >
                  <VRadio
                    v-for="option in getAnswerOptions('Rating-Scale Questions')"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                    density="comfortable"
                    class="mb-1"
                  />
                </VRadioGroup>

                <!-- Yes/No - Radio buttons -->
                <VRadioGroup
                  v-else-if="isResponseStyle(group.response_style, 'yes') || isResponseStyle(group.response_style, 'no')"
                  v-model="answers[question.id]"
                  inline
                >
                  <VRadio
                    v-for="option in getAnswerOptions('Yes or No')"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </VRadioGroup>

                <!-- Multiple Choice - Text field for now -->
                <VTextField
                  v-else-if="isResponseStyle(group.response_style, 'multiple')"
                  v-model="answers[question.id]"
                  label="Your Answer"
                  variant="outlined"
                  density="compact"
                />

                <!-- Open-Ended / Comment - Textarea -->
                <VTextarea
                  v-else-if="isResponseStyle(group.response_style, 'open') || isResponseStyle(group.response_style, 'comment')"
                  v-model="answers[question.id]"
                  label="Your Answer"
                  variant="outlined"
                  rows="3"
                />

                <!-- Default fallback - Radio 1-5 -->
                <VRadioGroup v-else v-model="answers[question.id]" class="ms-2">
                  <template v-if="survey?.evaluation_type === 'office'">
                    <VRadio label="5 - Outstanding" value="5" density="comfortable" class="mb-1" />
                    <VRadio label="4 - Very Satisfactory" value="4" density="comfortable" class="mb-1" />
                    <VRadio label="3 - Satisfactory" value="3" density="comfortable" class="mb-1" />
                    <VRadio label="2 - Unsatisfactory" value="2" density="comfortable" class="mb-1" />
                    <VRadio label="1 - Poor" value="1" density="comfortable" class="mb-1" />
                  </template>
                  <template v-else>
                    <VRadio label="5 - Always manifested" value="5" density="comfortable" class="mb-1" />
                    <VRadio label="4 - Often manifested" value="4" density="comfortable" class="mb-1" />
                    <VRadio label="3 - Sometimes manifested" value="3" density="comfortable" class="mb-1" />
                    <VRadio label="2 - Seldom manifested" value="2" density="comfortable" class="mb-1" />
                    <VRadio label="1 - Never/Rarely manifested" value="1" density="comfortable" class="mb-1" />
                  </template>
                </VRadioGroup>
              </VCardText>
            </VCard>
          </div>
        </VCardText>

        <VDivider />

        <!-- Warning Alert -->
        <VAlert
          type="warning"
          variant="tonal"
          class="ma-4"
        >
          <template #title>Important Notice</template>
          Once you submit this evaluation, you will not be able to view or modify your answers. Please review your responses carefully before submitting.
        </VAlert>

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="goBack">
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :loading="isSubmitting"
            @click="submitResponse"
          >
            Submit
          </VBtn>
        </VCardActions>
      </VCard>
    </template>

    <!-- Snackbar -->
    <VSnackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="3000"
      location="top"
    >
      {{ snackbar.message }}
    </VSnackbar>
  </div>
</template>

<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'StudentSurveys',
    allowedRoles: ['student'],
  },
})

interface StudentQuestion {
  id: number
  question: string
  sort?: number
}

interface StudentQuestionGroup {
  id: number
  number: number
  title: string
  response_style: string
  questions?: StudentQuestion[]
}

interface StudentSurvey {
  id: number
  title: string
  instruction?: string
  is_active: string
  evaluation_type?: 'Class' | 'Office'
  question_group?: StudentQuestionGroup[]
}

interface Teacher {
  id: number
  first_name: string
  last_name: string
}

interface ClassInfo {
  id: number
  section: string
  course_id?: { id: number; courseCode: string; courseName: string } | null
  teacher_id?: Teacher | null
}

interface SchoolOffice {
  id: number
  name: string
  description?: string
}

const route = useRoute()
const router = useRouter()

const surveyId = computed(() => Number(route.params.id))
const classId = computed(() => {
  const id = route.query.class
  return id ? Number(id) : null
})

const officeId = computed(() => {
  const id = route.query.office
  return id ? Number(id) : null
})

const isLoading = ref(true)
const isSubmitting = ref(false)
const survey = ref<StudentSurvey | null>(null)
const classInfo = ref<ClassInfo | null>(null)
const officeInfo = ref<SchoolOffice | null>(null)
const answers = ref<Record<number, string>>({})
const studentYearLevel = ref<number | null>(null)

const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

// Determine if this is an office-based evaluation (from survey data)
const isOfficeBased = computed(() => {
  const evalType = survey.value?.evaluation_type
  if (!evalType) return !!officeId.value // Fallback to query param
  return evalType.toLowerCase() === 'office'
})

// Get all questions as flat array with response style
const allQuestions = computed(() => {
  if (!survey.value?.question_group) return []
  const questions: { question: StudentQuestion; groupTitle: string; responseStyle: string }[] = []
  for (const group of survey.value.question_group) {
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
      return isOfficeBased.value ? officeRatingOptions : classRatingOptions
    case 'Rating-Scale Questions':
      return isOfficeBased.value ? officeRatingOptions : classRatingOptions
    case 'Yes or No':
      return [
        { value: 'Yes', label: 'Yes' },
        { value: 'No', label: 'No' },
      ]
    default:
      return []
  }
}

// Fetch class info
const fetchClassInfo = async () => {
  if (!classId.value) {
    classInfo.value = null
    return
  }
  try {
    const res = await $api(`/items/classes/${classId.value}`, {
      params: {
        fields: ['id', 'section', 'course_id.*', 'teacher_id.*'],
      },
    })
    classInfo.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch class info:', error)
    classInfo.value = null
  }
}

// Fetch office info
const fetchOfficeInfo = async () => {
  if (!officeId.value) {
    officeInfo.value = null
    return
  }
  try {
    const res = await $api(`/items/SchoolOffices/${officeId.value}`, {
      params: {
        fields: ['id', 'name', 'description'],
      },
    })
    officeInfo.value = res.data
  }
  catch (error) {
    console.error('Failed to fetch office info:', error)
    officeInfo.value = null
  }
}

// Fetch student's year level
const fetchStudentYearLevel = async () => {
  try {
    const userData = useCookie('userData').value as any
    const sid = userData?.student_id
    if (sid) {
      const res = await $api(`/items/students/${sid}`, {
        params: { fields: ['year_level'] },
      })
      studentYearLevel.value = res.data?.year_level || null
    }
  }
  catch (err) {
    console.error('Failed to fetch student year level:', err)
  }
}

// Fetch survey
const fetchSurvey = async () => {
  isLoading.value = true
  try {
    const [surveyRes] = await Promise.all([
      $api(`/items/StudentEvaluationSurvey/${surveyId.value}`, {
        params: {
          fields: ['id', 'title', 'instruction', 'is_active', 'evaluation_type', 'students.students_id', 'question_group.*', 'question_group.questions.*'],
        },
      }),
      fetchClassInfo(),
      fetchOfficeInfo(),
      fetchStudentYearLevel(),
    ])
    survey.value = surveyRes.data

    // Validate that student is assigned to this survey
    const userData = useCookie('userData').value as any
    const studentId = userData?.student_id ? Number(userData.student_id) : null
    const assignedStudentIds = (surveyRes.data?.students || []).map((s: any) => Number(s.students_id))

    // If there are assigned students and current student is not in the list, show error
    if (assignedStudentIds.length > 0 && studentId && !assignedStudentIds.includes(studentId)) {
      snackbar.value = { show: true, message: 'You are not assigned to this survey', color: 'error' }
      setTimeout(() => router.push('/student/surveys'), 1500)
      return
    }
  }
  catch (error) {
    console.error('Failed to fetch survey:', error)
    snackbar.value = { show: true, message: 'Failed to load survey', color: 'error' }
  }
  finally {
    isLoading.value = false
  }
}

// Submit response (two-step approach)
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
    const studentId = userData?.student_id

    if (!studentId) {
      snackbar.value = { show: true, message: 'Student ID not found. Please logout and login again.', color: 'error' }
      return
    }

    // Step 1: Create the response first (without nested answers)
    const responseBody: any = {
      survey_id: surveyId.value,
      student_id: studentId,
      submitted_at: new Date().toISOString(),
      year_level: studentYearLevel.value,
    }

    // For office-based evaluations, include office_id
    if (officeId.value) {
      responseBody.office_id = officeId.value
    }
    // For class-based evaluations, include class_id and teacher
    else if (classId.value) {
      responseBody.class_id = classId.value

      // Include evaluated teacher if available from class
      if (classInfo.value?.teacher_id && typeof classInfo.value.teacher_id === 'object') {
        responseBody.evaluated_teached_id = classInfo.value.teacher_id.id
      }
    }

    const responseRes = await $api('/items/StudentSurveyResponses', {
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

    await $api('/items/StudentSurveyAnswers', {
      method: 'POST',
      body: answersData,
    })

    snackbar.value = { show: true, message: 'Evaluation submitted successfully!', color: 'success' }

    // Go back to surveys list after short delay
    setTimeout(() => {
      router.push('/student/surveys')
    }, 1500)
  }
  catch (error: any) {
    console.error('Failed to submit response:', error)
    console.error('Error details:', error?.data)
    let errorMessage = 'Failed to submit evaluation.'
    if (error?.data?.errors?.[0]?.extensions?.code === 'FORBIDDEN') {
      errorMessage = 'Permission denied. Please contact administrator to enable Create permission on StudentSurveyResponses and StudentSurveyAnswers.'
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
  router.push('/student/surveys')
}

// Get teacher name helper
const getTeacherName = (): string => {
  if (!classInfo.value?.teacher_id || typeof classInfo.value.teacher_id !== 'object') return '-'
  return `${classInfo.value.teacher_id.first_name} ${classInfo.value.teacher_id.last_name}`
}

// Get class name helper
const getClassName = (): string => {
  if (!classInfo.value) return '-'
  const courseCode = classInfo.value.course_id?.courseCode || ''
  const courseName = classInfo.value.course_id?.courseName || ''
  if (courseCode && courseName) {
    return `${courseCode} - ${courseName}`
  }
  return courseCode || courseName || '-'
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
          <!-- Office being evaluated -->
          <VAlert
            v-if="officeInfo"
            type="info"
            variant="tonal"
            class="mb-4"
          >
            <div class="d-flex flex-column gap-1">
              <div class="font-weight-medium">
                {{ officeInfo.name }}
              </div>
              <div v-if="officeInfo.description" class="text-body-2">
                {{ officeInfo.description }}
              </div>
            </div>
          </VAlert>

          <!-- Class and Teacher being evaluated -->
          <VAlert
            v-else-if="classInfo"
            type="info"
            variant="tonal"
            class="mb-4"
          >
            <div class="d-flex flex-column gap-1">
              <div>
                {{ getClassName() }}
              </div>
              <div>
                {{ getTeacherName() }}
              </div>
            </div>
          </VAlert>

          <p v-if="survey.instruction" class="text-body-2 text-medium-emphasis mb-6">
            <strong>Instructions:</strong> {{ survey.instruction }}
          </p>

          <!-- Question Groups -->
          <div
            v-for="(group, groupIndex) in survey.question_group"
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
                  <template v-if="isOfficeBased">
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

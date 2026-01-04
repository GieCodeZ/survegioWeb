<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'surveys',
    allowedRoles: ['administrator'],
  },
})

interface AcademicTerm {
  id: number
  schoolYear: string
  semester: string
}

interface DeanQuestion {
  id?: number
  question: string
  sort?: number
}

interface DeanQuestionGroup {
  id?: number
  number: number
  title: string
  response_style: string
  questions?: DeanQuestion[]
}

interface DeanSurveyForm {
  id?: number
  title: string
  instruction: string
  survey_start: string
  survey_end: string
  is_active: 'Active' | 'Draft' | 'Archived'
  academic_term_id: number | null
  question_groups: DeanQuestionGroup[]
}

interface DeanResponse {
  id: number
  survey_id: number
  dean_id: { id: number; first_name: string; last_name: string } | number
  evaluated_teached_id?: { id: number; first_name: string; last_name: string } | number | null
  department_id?: { id: number; name: { programCode: string } } | number | null
  submitted_at: string
  answers?: any[]
}

interface TeacherItem {
  id: number
  first_name: string
  last_name: string
  position?: string
  is_active?: string
  departmentName?: string
}

const route = useRoute()
const router = useRouter()

const surveyId = computed(() => Number((route.params as { id: string }).id))

// State
const activeTab = ref<'edit' | 'assignment' | 'responses'>('edit')
const isLoading = ref(true)
const isSaving = ref(false)
const isLoadingResponses = ref(false)
const academicTerms = ref<AcademicTerm[]>([])
const responses = ref<DeanResponse[]>([])

// Teacher selection state (for teachers to evaluate)
const availableTeachers = ref<TeacherItem[]>([])
const assignedTeacherIds = ref<number[]>([])
const teacherSearch = ref('')
const isLoadingTeachers = ref(false)
const activeDeanCount = ref(0)

const form = ref<DeanSurveyForm>({
  title: '',
  instruction: '',
  survey_start: '',
  survey_end: '',
  is_active: 'Draft',
  academic_term_id: null,
  question_groups: [],
})

// Date picker menu state
const startDateMenu = ref(false)
const endDateMenu = ref(false)

// Snackbar state
const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

// Options
const statusOptions = [
  { title: 'Draft', value: 'Draft' },
  { title: 'Active', value: 'Active' },
  { title: 'Archived', value: 'Archived' },
]

// Table headers for faculty members
const facultyTableHeaders = [
  { title: 'Faculty Member', key: 'name', sortable: true },
  { title: 'Avg Rating', key: 'averageRating', sortable: true, align: 'center' as const },
]

const responseStyleOptions = ref<{ title: string; value: string }[]>([])

// Fetch response style options from Directus
const fetchResponseStyleOptions = async () => {
  try {
    const res = await $api('/fields/DeanSurveyGroup/response_style')
    const choices = res.data?.meta?.options?.choices || []
    responseStyleOptions.value = choices.map((choice: { text: string; value: string }) => ({
      title: choice.text,
      value: choice.value,
    }))
  }
  catch (error) {
    console.error('Failed to fetch response style options:', error)
    // Fallback to default options
    responseStyleOptions.value = [
      { title: 'Rating-Scale Questions', value: 'Rating-Scale Questions' },
      { title: 'Open-Ended Question', value: 'Open-Ended Question' },
      { title: 'Comment', value: 'Comment' },
    ]
  }
}

// Format datetime for input field (YYYY-MM-DDTHH:mm)
const formatDateForInput = (dateStr: string | null): string => {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ''
    // Format for datetime-local input: YYYY-MM-DDTHH:mm
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }
  catch {
    return ''
  }
}

// Format date for display
const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  catch {
    return dateStr
  }
}

// Date picker computed properties
const startDateValue = computed({
  get: () => form.value.survey_start ? new Date(form.value.survey_start) : null,
  set: (val: Date | null) => {
    if (val) {
      const existing = form.value.survey_start ? new Date(form.value.survey_start) : null
      if (existing) {
        val.setHours(existing.getHours(), existing.getMinutes())
      }
      form.value.survey_start = val.toISOString()
    }
    else {
      form.value.survey_start = ''
    }
  },
})

const endDateValue = computed({
  get: () => form.value.survey_end ? new Date(form.value.survey_end) : null,
  set: (val: Date | null) => {
    if (val) {
      const existing = form.value.survey_end ? new Date(form.value.survey_end) : null
      if (existing) {
        val.setHours(existing.getHours(), existing.getMinutes())
      }
      else {
        val.setHours(23, 59)
      }
      form.value.survey_end = val.toISOString()
    }
    else {
      form.value.survey_end = ''
    }
  },
})

const startTimeValue = computed({
  get: () => {
    if (!form.value.survey_start) return '00:00'
    const date = new Date(form.value.survey_start)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  },
  set: (val: string) => {
    if (!form.value.survey_start) {
      const now = new Date()
      form.value.survey_start = now.toISOString()
    }
    const [hours, minutes] = val.split(':').map(Number)
    const date = new Date(form.value.survey_start)
    date.setHours(hours, minutes)
    form.value.survey_start = date.toISOString()
  },
})

const endTimeValue = computed({
  get: () => {
    if (!form.value.survey_end) return '23:59'
    const date = new Date(form.value.survey_end)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  },
  set: (val: string) => {
    if (!form.value.survey_end) {
      const now = new Date()
      form.value.survey_end = now.toISOString()
    }
    const [hours, minutes] = val.split(':').map(Number)
    const date = new Date(form.value.survey_end)
    date.setHours(hours, minutes)
    form.value.survey_end = date.toISOString()
  },
})

// Fetch academic terms (only active)
const fetchAcademicTerms = async () => {
  try {
    const res = await $api('/items/academicTerms', {
      params: {
        filter: { status: { _eq: 'Active' } },
        sort: '-schoolYear',
      },
    })
    academicTerms.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch academic terms:', error)
  }
}

// Fetch survey details
const fetchSurveyDetails = async () => {
  if (!surveyId.value || isNaN(surveyId.value)) {
    console.warn('Invalid survey ID, skipping fetch')
    isLoading.value = false
    return
  }

  isLoading.value = true
  try {
    const res = await $api(`/items/DeanEvaluationSurvey/${surveyId.value}`, {
      params: {
        fields: ['*', 'academic_term_id.*', 'question_groups.*', 'question_groups.questions.*'],
      },
    })

    const data = res.data

    // Extract academic term ID
    const acadTermId = typeof data.academic_term_id === 'object' && data.academic_term_id !== null
      ? data.academic_term_id.id
      : data.academic_term_id

    // Map question groups
    const questionGroups: DeanQuestionGroup[] = (data.question_groups || []).map((group: any, index: number) => ({
      id: group.id,
      number: group.number || index + 1,
      title: group.title || '',
      response_style: group.response_style || 'Rating-Scale Question',
      questions: (group.questions || []).map((q: any) => ({
        id: q.id,
        question: q.question || '',
        sort: q.sort,
      })),
    }))

    form.value = {
      id: data.id,
      title: data.title || '',
      instruction: data.instruction || '',
      survey_start: formatDateForInput(data.survey_start),
      survey_end: formatDateForInput(data.survey_end),
      is_active: data.is_active || 'Draft',
      academic_term_id: acadTermId,
      question_groups: questionGroups,
    }
  }
  catch (error) {
    console.error('Failed to fetch survey details:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Fetch survey responses
const fetchResponses = async () => {
  if (!surveyId.value || isNaN(surveyId.value)) {
    console.warn('Invalid survey ID, skipping fetch responses')
    isLoadingResponses.value = false
    return
  }

  isLoadingResponses.value = true
  try {
    const res = await $api('/items/DeanSurveyResponses', {
      params: {
        filter: { survey_id: { _eq: surveyId.value } },
        fields: ['*', 'dean_id.*', 'evaluated_teached_id.*', 'department_id.*', 'department_id.name.*', 'answers.*', 'answers.question_id.*'],
        sort: ['-submitted_at'],
      },
    })
    responses.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch responses:', error)
    responses.value = []
  }
  finally {
    isLoadingResponses.value = false
  }
}

// Fetch available teachers (professors) who can be evaluated
const fetchAvailableTeachers = async () => {
  isLoadingTeachers.value = true
  try {
    // Fetch all active teachers (non-deans) who can be evaluated
    const teachersRes = await $api('/items/Teachers', {
      params: {
        filter: {
          is_active: { _eq: 'Active' },
          position: { _neq: 'Dean' },
        },
        fields: ['id', 'first_name', 'last_name', 'position', 'is_active'],
        sort: ['last_name', 'first_name'],
        limit: -1,
      },
    })

    // Fetch departments to map department names to teachers
    const deptsRes = await $api('/items/Department', {
      params: {
        fields: ['id', 'name.*', 'teacher_id.Teachers_id'],
        limit: -1,
      },
    })

    // Count active deans for info display
    const deansRes = await $api('/items/Teachers', {
      params: {
        filter: {
          position: { _eq: 'Dean' },
          is_active: { _eq: 'Active' },
        },
        aggregate: { count: '*' },
      },
    })
    activeDeanCount.value = Number(deansRes.data?.[0]?.count) || 0

    const departments = deptsRes.data || []
    const teachers: (TeacherItem & { departmentName?: string })[] = teachersRes.data || []

    // Map department names to teachers
    for (const teacher of teachers) {
      for (const dept of departments) {
        const teacherIds = dept.teacher_id || []
        const isInDept = teacherIds.some((t: any) => {
          const tid = t.Teachers_id ?? t.id ?? t
          return tid === teacher.id || (typeof tid === 'object' && tid?.id === teacher.id)
        })
        if (isInDept && typeof dept.name === 'object' && dept.name) {
          (teacher as any).departmentName = dept.name.programCode || dept.name.programName
          break
        }
      }
    }

    availableTeachers.value = teachers
  }
  catch (error) {
    console.error('Failed to fetch teachers:', error)
    availableTeachers.value = []
  }
  finally {
    isLoadingTeachers.value = false
  }
}

// Fetch teachers already assigned to this survey
const fetchAssignedTeachers = async () => {
  if (!surveyId.value || isNaN(surveyId.value)) {
    console.warn('Invalid survey ID, skipping fetch assigned teachers')
    return
  }

  try {
    const res = await $api(`/items/DeanEvaluationSurvey/${surveyId.value}`, {
      params: {
        fields: ['teachers_to_evaluate.Teachers_id.id'],
      },
    })

    const teacherAssignments = res.data?.teachers_to_evaluate || []
    assignedTeacherIds.value = teacherAssignments
      .map((t: any) => {
        if (typeof t.Teachers_id === 'object' && t.Teachers_id !== null) {
          return t.Teachers_id.id
        }
        return t.Teachers_id
      })
      .filter((id: any) => id != null && typeof id === 'number')
  }
  catch (error) {
    console.error('Failed to fetch assigned teachers:', error)
    assignedTeacherIds.value = []
  }
}

// Filtered teachers based on search
const filteredTeachers = computed(() => {
  if (!teacherSearch.value) return availableTeachers.value
  const search = teacherSearch.value.toLowerCase()
  return availableTeachers.value.filter((t: any) => {
    const fullName = `${t.first_name} ${t.last_name}`.toLowerCase()
    const deptName = t.departmentName?.toLowerCase() || ''
    return fullName.includes(search) || deptName.includes(search)
  })
})

// Toggle teacher assignment
const toggleTeacherAssignment = (teacherId: number) => {
  const index = assignedTeacherIds.value.indexOf(teacherId)
  if (index === -1) {
    assignedTeacherIds.value.push(teacherId)
  }
  else {
    assignedTeacherIds.value.splice(index, 1)
  }
}

// Check if teacher is assigned
const isTeacherAssigned = (teacherId: number): boolean => {
  return assignedTeacherIds.value.includes(teacherId)
}

// Select all teachers
const selectAllTeachers = () => {
  assignedTeacherIds.value = availableTeachers.value.map(t => t.id)
}

// Deselect all teachers
const deselectAllTeachers = () => {
  assignedTeacherIds.value = []
}

// Get unique evaluated teachers from responses with metrics
const evaluatedTeachers = computed(() => {
  const teacherMap = new Map<number, {
    id: number
    name: string
    responseCount: number
    ratingSum: number
    ratingCount: number
  }>()

  for (const response of responses.value) {
    if (!response.evaluated_teached_id) continue
    const teacherId = typeof response.evaluated_teached_id === 'object'
      ? response.evaluated_teached_id.id
      : response.evaluated_teached_id
    const teacherName = typeof response.evaluated_teached_id === 'object'
      ? `${response.evaluated_teached_id.first_name} ${response.evaluated_teached_id.last_name}`
      : `Teacher #${teacherId}`

    // Calculate rating from this response's answers
    let responseRatingSum = 0
    let responseRatingCount = 0
    if (response.answers) {
      for (const answer of response.answers) {
        const numVal = parseFloat(answer.answer_value)
        if (!isNaN(numVal) && numVal >= 1 && numVal <= 5) {
          responseRatingSum += numVal
          responseRatingCount++
        }
      }
    }

    if (teacherMap.has(teacherId)) {
      const existing = teacherMap.get(teacherId)!
      existing.responseCount++
      existing.ratingSum += responseRatingSum
      existing.ratingCount += responseRatingCount
    }
    else {
      teacherMap.set(teacherId, {
        id: teacherId,
        name: teacherName,
        responseCount: 1,
        ratingSum: responseRatingSum,
        ratingCount: responseRatingCount,
      })
    }
  }

  // Convert to array with calculated average rating
  return Array.from(teacherMap.values()).map(teacher => ({
    id: teacher.id,
    name: teacher.name,
    responseCount: teacher.responseCount,
    averageRating: teacher.ratingCount > 0 ? teacher.ratingSum / teacher.ratingCount : 0,
  })).sort((a, b) => a.name.localeCompare(b.name))
})

// Open professor detail page
const openProfessorDetail = (professorId: number) => {
  router.push(`/surveys/dean-evaluation/professor-${surveyId.value}-${professorId}`)
}

// Question Group Management
const addQuestionGroup = () => {
  form.value.question_groups.push({
    number: form.value.question_groups.length + 1,
    title: '',
    response_style: 'Rating-Scale Question',
    questions: [{ question: '' }],
  })
}

const removeQuestionGroup = (index: number) => {
  form.value.question_groups.splice(index, 1)
  form.value.question_groups.forEach((group, i) => {
    group.number = i + 1
  })
}

// Question Management
const addQuestion = (groupIndex: number) => {
  form.value.question_groups[groupIndex].questions!.push({ question: '' })
}

const removeQuestion = (groupIndex: number, questionIndex: number) => {
  form.value.question_groups[groupIndex].questions!.splice(questionIndex, 1)
}

// Save survey
const saveSurvey = async () => {
  if (!surveyId.value || isNaN(surveyId.value)) {
    snackbar.value = { show: true, message: 'Invalid survey ID', color: 'error' }
    return
  }

  if (!form.value.title.trim()) {
    snackbar.value = { show: true, message: 'Please enter a survey title', color: 'error' }
    return
  }

  isSaving.value = true
  try {
    // Build the teachers_to_evaluate M2M data
    const teachersToEvaluate = assignedTeacherIds.value.map(id => ({
      Teachers_id: id,
    }))

    // Build the request body with teachers_to_evaluate
    const requestBody: any = {
      title: form.value.title,
      instruction: form.value.instruction,
      survey_start: form.value.survey_start || null,
      survey_end: form.value.survey_end || null,
      is_active: form.value.is_active,
      academic_term_id: form.value.academic_term_id,
      question_groups: form.value.question_groups.length > 0 ? form.value.question_groups : undefined,
      teachers_to_evaluate: teachersToEvaluate,
    }

    await $api(`/items/DeanEvaluationSurvey/${surveyId.value}`, {
      method: 'PATCH',
      body: requestBody,
    })

    snackbar.value = { show: true, message: 'Evaluation saved successfully!', color: 'success' }
    router.push('/surveys/dean-evaluation')
  }
  catch (error: any) {
    console.error('Failed to save survey:', error)
    const errorMsg = error?.data?.errors?.[0]?.message || error?.statusText || 'Failed to save evaluation'
    snackbar.value = { show: true, message: `Error: ${errorMsg}`, color: 'error' }
  }
  finally {
    isSaving.value = false
  }
}

// Go back to surveys list
const goBack = () => {
  router.push('/surveys/dean-evaluation')
}

// Watch tab changes
watch(activeTab, (newTab) => {
  if (newTab === 'responses' && responses.value.length === 0) {
    fetchResponses()
  }
  if (newTab === 'assignment' && availableTeachers.value.length === 0) {
    fetchAvailableTeachers()
    fetchAssignedTeachers()
  }
})

onMounted(() => {
  fetchResponseStyleOptions()
  fetchAcademicTerms()
  fetchSurveyDetails()
  fetchAssignedTeachers()
})
</script>

<template>
  <div>
    <!-- Loading State -->
    <VCard v-if="isLoading">
      <VCardText class="d-flex justify-center align-center pa-12">
        <VProgressCircular indeterminate color="primary" />
        <span class="ms-4">Loading evaluation...</span>
      </VCardText>
    </VCard>

    <!-- Main Content -->
    <VCard v-else>
      <VCardTitle class="pa-6">
        <div class="d-flex align-center">
          <VBtn icon variant="text" class="me-2" @click="goBack">
            <VIcon icon="ri-arrow-left-line" />
          </VBtn>
          <VIcon icon="ri-user-settings-line" size="28" class="me-3" />
          <div>
            <span class="text-h5">{{ form.title }}</span>
            <div class="d-flex align-center gap-2 mt-1">
              <VChip
                :color="form.is_active === 'Active' ? 'success' : form.is_active === 'Draft' ? 'warning' : 'secondary'"
                size="small"
                variant="tonal"
              >
                {{ form.is_active }}
              </VChip>
            </div>
          </div>
        </div>
      </VCardTitle>

      <VDivider />

      <!-- Tabs -->
      <VTabs v-model="activeTab" class="px-4">
        <VTab value="edit">
          <VIcon icon="ri-edit-line" class="me-2" />
          Edit Evaluation
        </VTab>
        <VTab value="assignment">
          <VIcon icon="ri-user-settings-line" class="me-2" />
          Teachers
          <VChip v-if="assignedTeacherIds.length > 0" size="x-small" color="success" class="ms-2">
            {{ assignedTeacherIds.length }}
          </VChip>
        </VTab>
        <VTab value="responses">
          <VIcon icon="ri-bar-chart-line" class="me-2" />
          Responses
          <VChip v-if="responses.length > 0" size="x-small" color="primary" class="ms-2">
            {{ responses.length }}
          </VChip>
        </VTab>
      </VTabs>

      <VDivider />

      <!-- Edit Tab -->
      <template v-if="activeTab === 'edit'">
        <VCardText class="pa-6">
          <VForm @submit.prevent="saveSurvey">
            <VRow>
              <!-- Basic Information -->
              <VCol cols="12">
                <h6 class="text-h6 mb-4">Basic Information</h6>
              </VCol>

              <VCol cols="12" md="8">
                <VTextField
                  v-model="form.title"
                  label="Evaluation Title"
                  placeholder="Enter evaluation title"
                  variant="outlined"
                  :rules="[v => !!v || 'Title is required']"
                />
              </VCol>

              <VCol cols="12" md="4">
                <VSelect
                  v-model="form.is_active"
                  :items="statusOptions"
                  item-title="title"
                  item-value="value"
                  label="Status"
                  variant="outlined"
                />
              </VCol>

              <VCol cols="12">
                <VTextarea
                  v-model="form.instruction"
                  label="Instructions"
                  placeholder="Enter instructions for respondents"
                  variant="outlined"
                  rows="3"
                />
              </VCol>

              <!-- Schedule -->
              <VCol cols="12" class="mt-4">
                <h6 class="text-h6 mb-4">Schedule</h6>
              </VCol>

              <VCol cols="12">
                <VSelect
                  v-model="form.academic_term_id"
                  :items="academicTerms"
                  :item-title="(item) => `${item.schoolYear} - ${item.semester}`"
                  item-value="id"
                  label="Academic Term"
                  variant="outlined"
                  clearable
                />
              </VCol>

              <!-- Start Date & Time -->
              <VCol cols="12" md="4">
                <VMenu
                  v-model="startDateMenu"
                  :close-on-content-click="false"
                  location="bottom start"
                >
                  <template #activator="{ props }">
                    <VTextField
                      v-bind="props"
                      :model-value="formatDateDisplay(form.survey_start)"
                      label="Start Date & Time"
                      variant="outlined"
                      prepend-inner-icon="ri-calendar-line"
                      readonly
                      clearable
                      @click:clear="form.survey_start = ''"
                    />
                  </template>
                  <VCard min-width="300">
                    <VDatePicker
                      v-model="startDateValue"
                      show-adjacent-months
                      hide-header
                    />
                    <VDivider />
                    <div class="pa-3">
                      <VTextField
                        v-model="startTimeValue"
                        label="Time"
                        type="time"
                        variant="outlined"
                        density="compact"
                        hide-details
                      />
                    </div>
                    <VCardActions>
                      <VSpacer />
                      <VBtn variant="text" @click="startDateMenu = false">Done</VBtn>
                    </VCardActions>
                  </VCard>
                </VMenu>
              </VCol>

              <!-- End Date & Time -->
              <VCol cols="12" md="4">
                <VMenu
                  v-model="endDateMenu"
                  :close-on-content-click="false"
                  location="bottom start"
                >
                  <template #activator="{ props }">
                    <VTextField
                      v-bind="props"
                      :model-value="formatDateDisplay(form.survey_end)"
                      label="End Date & Time"
                      variant="outlined"
                      prepend-inner-icon="ri-calendar-line"
                      readonly
                      clearable
                      @click:clear="form.survey_end = ''"
                    />
                  </template>
                  <VCard min-width="300">
                    <VDatePicker
                      v-model="endDateValue"
                      show-adjacent-months
                      hide-header
                    />
                    <VDivider />
                    <div class="pa-3">
                      <VTextField
                        v-model="endTimeValue"
                        label="Time"
                        type="time"
                        variant="outlined"
                        density="compact"
                        hide-details
                      />
                    </div>
                    <VCardActions>
                      <VSpacer />
                      <VBtn variant="text" @click="endDateMenu = false">Done</VBtn>
                    </VCardActions>
                  </VCard>
                </VMenu>
              </VCol>

              <!-- Question Groups -->
              <VCol cols="12" class="mt-4">
                <div class="d-flex align-center justify-space-between mb-4">
                  <h6 class="text-h6">Question Groups</h6>
                  <VBtn
                    color="primary"
                    variant="outlined"
                    size="small"
                    prepend-icon="ri-add-line"
                    @click="addQuestionGroup"
                  >
                    Add Group
                  </VBtn>
                </div>
              </VCol>

              <VCol v-if="form.question_groups.length === 0" cols="12">
                <VAlert type="info" variant="tonal">
                  No question groups added yet. Click "Add Group" to create your first question group.
                </VAlert>
              </VCol>

              <VCol v-for="(group, groupIndex) in form.question_groups" :key="groupIndex" cols="12">
                <VCard variant="outlined" class="mb-4">
                  <VCardTitle class="pa-4 bg-grey-lighten-4">
                    <div class="d-flex align-center justify-space-between">
                      <span class="text-subtitle-1 font-weight-medium">
                        Group {{ group.number }}
                      </span>
                      <VBtn
                        icon
                        variant="text"
                        color="error"
                        size="small"
                        @click="removeQuestionGroup(groupIndex)"
                      >
                        <VIcon icon="ri-delete-bin-line" />
                      </VBtn>
                    </div>
                  </VCardTitle>

                  <VDivider />

                  <VCardText class="pa-4">
                    <VRow>
                      <VCol cols="12" md="6">
                        <VTextField
                          v-model="group.title"
                          label="Group Title"
                          placeholder="e.g., Teaching Quality"
                          variant="outlined"
                          density="compact"
                        />
                      </VCol>

                      <VCol cols="12" md="6">
                        <VSelect
                          v-model="group.response_style"
                          :items="responseStyleOptions"
                          item-title="title"
                          item-value="value"
                          label="Response Style"
                          variant="outlined"
                          density="compact"
                        />
                      </VCol>

                      <VCol cols="12">
                        <div class="d-flex align-center justify-space-between mb-3">
                          <span class="text-subtitle-2">Questions</span>
                          <VBtn
                            color="secondary"
                            variant="tonal"
                            size="x-small"
                            prepend-icon="ri-add-line"
                            @click="addQuestion(groupIndex)"
                          >
                            Add Question
                          </VBtn>
                        </div>

                        <div
                          v-for="(question, questionIndex) in group.questions"
                          :key="questionIndex"
                          class="d-flex align-center gap-2 mb-2"
                        >
                          <span class="text-body-2 text-medium-emphasis" style="min-width: 24px;">
                            {{ questionIndex + 1 }}.
                          </span>
                          <VTextField
                            v-model="question.question"
                            :placeholder="`Enter question ${questionIndex + 1}`"
                            variant="outlined"
                            density="compact"
                            hide-details
                            class="flex-grow-1"
                          />
                          <VBtn
                            icon
                            variant="text"
                            color="error"
                            size="x-small"
                            :disabled="group.questions!.length === 1"
                            @click="removeQuestion(groupIndex, questionIndex)"
                          >
                            <VIcon icon="ri-close-line" size="18" />
                          </VBtn>
                        </div>
                      </VCol>
                    </VRow>
                  </VCardText>
                </VCard>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-6">
          <VSpacer />
          <VBtn variant="outlined" @click="goBack">
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :loading="isSaving"
            @click="saveSurvey"
          >
            Save Changes
          </VBtn>
        </VCardActions>
      </template>

      <!-- Assignment Tab - Teachers to Evaluate -->
      <template v-else-if="activeTab === 'assignment'">
        <VCardText class="pa-6">
          <!-- Loading -->
          <div v-if="isLoadingTeachers" class="d-flex justify-center align-center pa-12">
            <VProgressCircular indeterminate color="primary" />
            <span class="ms-4">Loading teachers...</span>
          </div>

          <template v-else>
            <!-- Compact Summary Bar -->
            <VCard variant="flat" class="bg-surface mb-4">
              <VCardText class="d-flex align-center flex-wrap gap-4 pa-4">
                <div class="d-flex align-center gap-2">
                  <VIcon icon="ri-checkbox-circle-fill" color="success" />
                  <span class="text-body-1">
                    <strong>{{ assignedTeacherIds.length }}</strong> of {{ availableTeachers.length }} teachers selected
                  </span>
                </div>
                <VSpacer />
                <span class="text-body-2 text-medium-emphasis">
                  {{ activeDeanCount }} active dean(s) will evaluate
                </span>
              </VCardText>
            </VCard>

            <!-- Search and Actions -->
            <div class="d-flex align-center gap-4 mb-4">
              <VTextField
                v-model="teacherSearch"
                prepend-inner-icon="ri-search-line"
                placeholder="Search teachers..."
                density="compact"
                variant="outlined"
                hide-details
                style="max-width: 300px;"
              />
              <VSpacer />
              <VBtnGroup variant="outlined" density="compact">
                <VBtn color="success" @click="selectAllTeachers">
                  <VIcon icon="ri-checkbox-multiple-line" class="me-1" />
                  All
                </VBtn>
                <VBtn color="secondary" @click="deselectAllTeachers">
                  <VIcon icon="ri-checkbox-blank-line" class="me-1" />
                  None
                </VBtn>
              </VBtnGroup>
            </div>

            <!-- No Teachers -->
            <div v-if="availableTeachers.length === 0" class="text-center pa-12">
              <VIcon icon="ri-user-line" size="64" color="medium-emphasis" class="mb-4" />
              <p class="text-h6 text-medium-emphasis mb-2">No Teachers Available</p>
              <p class="text-body-2 text-medium-emphasis">
                Add active teachers (non-deans) to your system to assign them for evaluation.
              </p>
            </div>

            <!-- Teachers List -->
            <VCard v-else variant="outlined">
              <VList lines="two" class="pa-0">
                <template v-for="(teacher, index) in filteredTeachers" :key="teacher.id">
                  <VListItem
                    :class="isTeacherAssigned(teacher.id) ? 'bg-success-lighten-5 border-s-4 border-success' : ''"
                    class="transition-all"
                    @click="toggleTeacherAssignment(teacher.id)"
                  >
                    <template #prepend>
                      <VCheckboxBtn
                        :model-value="isTeacherAssigned(teacher.id)"
                        color="success"
                        @click.stop="toggleTeacherAssignment(teacher.id)"
                      />
                    </template>

                    <VListItemTitle class="font-weight-medium">
                      {{ teacher.first_name }} {{ teacher.last_name }}
                      <VIcon
                        v-if="isTeacherAssigned(teacher.id)"
                        icon="ri-check-line"
                        color="success"
                        size="16"
                        class="ms-1"
                      />
                    </VListItemTitle>

                    <VListItemSubtitle class="text-medium-emphasis">
                      {{ teacher.position || 'No Position' }} | {{ teacher.departmentName || 'No Department' }}
                    </VListItemSubtitle>
                  </VListItem>

                  <VDivider v-if="index < filteredTeachers.length - 1" />
                </template>
              </VList>

              <!-- No search results -->
              <div v-if="availableTeachers.length > 0 && filteredTeachers.length === 0" class="text-center pa-8">
                <VIcon icon="ri-search-line" size="48" color="medium-emphasis" class="mb-4" />
                <p class="text-body-1 text-medium-emphasis">No teachers match your search</p>
              </div>
            </VCard>
          </template>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-6">
          <VSpacer />
          <VBtn variant="outlined" @click="goBack">
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :loading="isSaving"
            @click="saveSurvey"
          >
            Save Changes
          </VBtn>
        </VCardActions>
      </template>

      <!-- Responses Tab -->
      <template v-else-if="activeTab === 'responses'">
        <VCardText class="pa-6">
          <!-- Loading -->
          <div v-if="isLoadingResponses" class="d-flex justify-center align-center pa-12">
            <VProgressCircular indeterminate color="primary" />
            <span class="ms-4">Loading responses...</span>
          </div>

          <!-- No Responses -->
          <div v-else-if="responses.length === 0" class="text-center pa-12">
            <VIcon icon="ri-inbox-line" size="48" color="medium-emphasis" class="mb-4" />
            <p class="text-subtitle-1 text-medium-emphasis mb-2">No Responses Yet</p>
            <p class="text-body-2 text-medium-emphasis">
              Responses will appear here once deans submit their evaluations.
            </p>
          </div>

          <!-- Responses Summary -->
          <template v-else>
            <!-- Summary Card -->
            <VCard variant="outlined" class="mb-6">
              <VCardText class="pa-4">
                <div class="d-flex flex-wrap align-center justify-space-between gap-4">
                  <div class="d-flex align-center gap-8">
                    <div class="text-center">
                      <div class="text-h5 font-weight-bold">{{ responses.length }}</div>
                      <div class="text-caption text-medium-emphasis">Responses</div>
                    </div>
                    <VDivider vertical class="align-self-stretch" />
                    <div class="text-center">
                      <div class="text-h5 font-weight-bold">{{ evaluatedTeachers.length }}</div>
                      <div class="text-caption text-medium-emphasis">Faculty Evaluated</div>
                    </div>
                  </div>
                  <span class="text-body-2 text-medium-emphasis">
                    Latest: {{ formatDateDisplay(responses[0]?.submitted_at) }}
                  </span>
                </div>
              </VCardText>
            </VCard>

            <!-- Faculty Members Table -->
            <VCard v-if="evaluatedTeachers.length > 0" variant="outlined">
              <VCardTitle class="pa-4 text-subtitle-1">
                Evaluated Faculty Members
              </VCardTitle>
              <VDivider />
              <VDataTable
                :headers="facultyTableHeaders"
                :items="evaluatedTeachers"
                hover
                class="clickable-rows"
                density="comfortable"
                @click:row="(_event: Event, { item }: { item: any }) => openProfessorDetail(item.id)"
              >
                <template #item.name="{ item }">
                  <span class="font-weight-medium">{{ item.name }}</span>
                </template>

                <template #item.responseCount="{ item }">
                  {{ item.responseCount }}
                </template>

                <template #item.averageRating="{ item }">
                  <span
                    v-if="item.averageRating > 0"
                    class="font-weight-medium"
                    :class="item.averageRating >= 4 ? 'text-success' : item.averageRating >= 3 ? 'text-warning' : 'text-error'"
                  >
                    {{ item.averageRating.toFixed(2) }}
                  </span>
                  <span v-else class="text-medium-emphasis">-</span>
                </template>

                <template #no-data>
                  <div class="text-center pa-4">
                    <p class="text-body-2 text-medium-emphasis">No faculty data available</p>
                  </div>
                </template>
              </VDataTable>
            </VCard>

            <VAlert v-else type="info" variant="tonal">
              No evaluated faculty members found. Reports will appear here after evaluations are submitted.
            </VAlert>
          </template>
        </VCardText>
      </template>
    </VCard>

    <!-- Snackbar for notifications -->
    <VSnackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      :timeout="4000"
      location="top end"
    >
      {{ snackbar.message }}
      <template #actions>
        <VBtn variant="text" @click="snackbar.show = false">
          Close
        </VBtn>
      </template>
    </VSnackbar>
  </div>
</template>

<style scoped>
.clickable-rows :deep(tbody tr) {
  cursor: pointer;
}

.clickable-rows :deep(tbody tr:hover) {
  background-color: rgba(var(--v-theme-primary), 0.04);
}
</style>

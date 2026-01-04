<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'surveys',
    allowedRoles: ['administrator'],
  },
})

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

interface SurveyAnswer {
  id: number
  question_id: number | DeanQuestion
  answer_value: string
}

interface DeanResponse {
  id: number
  survey_id: number
  dean_id: { id: number; first_name: string; last_name: string } | number
  evaluated_teached_id?: { id: number; first_name: string; last_name: string } | number | null
  submitted_at: string
  answers?: SurveyAnswer[]
}

interface CommentData {
  id: number
  answerId: number
  questionText: string
  submittedAt: string
  comment: string
  deanName: string
}

const route = useRoute()
const router = useRouter()

const surveyId = computed(() => Number((route.params as { surveyId: string }).surveyId))
const professorId = computed(() => Number((route.params as { professorId: string }).professorId))

// State
const isLoading = ref(true)
const survey = ref<{
  id: number
  title: string
  question_groups: DeanQuestionGroup[]
  academic_term?: { id: number; schoolYear: string; semester: string } | null
} | null>(null)
const professor = ref<{ id: number; first_name: string; last_name: string } | null>(null)
const response = ref<DeanResponse | null>(null)

// Comment editing state
const isEditCommentDialogOpen = ref(false)
const isDeleteCommentDialogOpen = ref(false)
const editingComment = ref<CommentData | null>(null)
const editedCommentText = ref('')
const isSavingComment = ref(false)

// Helper: Find question by ID and get its response style
const findQuestion = (questionId: number | DeanQuestion): { question: string; responseStyle: string } | null => {
  const qId = typeof questionId === 'object' ? questionId.id : questionId
  if (!survey.value?.question_groups) return null

  for (const group of survey.value.question_groups) {
    for (const q of group.questions || []) {
      if (q.id === qId) {
        return { question: q.question, responseStyle: group.response_style }
      }
    }
  }
  return null
}

// Helper: Check if response style is for comments only (not rating-scale or open-ended)
const isCommentStyle = (responseStyle: string): boolean => {
  if (!responseStyle) return false
  const lower = responseStyle.toLowerCase()
  return lower.includes('comment')
}

// Computed: Question statistics (single response, no averaging needed)
const questionStatistics = computed(() => {
  if (!survey.value?.question_groups || !response.value) return []

  const stats: {
    groupTitle: string
    groupNumber: number
    responseStyle: string
    questions: {
      questionId: number
      questionText: string
      answerValue: string
    }[]
  }[] = []

  for (const group of survey.value.question_groups) {
    // Skip comment groups from the rating display
    if (isCommentStyle(group.response_style)) continue

    const groupStats: typeof stats[0] = {
      groupTitle: group.title,
      groupNumber: group.number,
      responseStyle: group.response_style,
      questions: [],
    }

    for (const question of group.questions || []) {
      const questionId = question.id || 0

      // Find answer for this question
      let answerValue = '-'
      if (response.value.answers) {
        for (const answer of response.value.answers) {
          const ansQId = typeof answer.question_id === 'object'
            ? answer.question_id.id
            : answer.question_id

          if (ansQId === questionId) {
            answerValue = answer.answer_value || '-'
            break
          }
        }
      }

      groupStats.questions.push({
        questionId,
        questionText: question.question,
        answerValue,
      })
    }

    if (groupStats.questions.length > 0) {
      stats.push(groupStats)
    }
  }

  return stats.sort((a, b) => a.groupNumber - b.groupNumber)
})

// Computed: All comments from Open-Ended question answers
const allComments = computed<CommentData[]>(() => {
  const comments: CommentData[] = []

  if (!response.value?.answers) return comments

  const deanName = typeof response.value.dean_id === 'object'
    ? `${response.value.dean_id.first_name} ${response.value.dean_id.last_name}`
    : `Dean #${response.value.dean_id}`

  for (const answer of response.value.answers) {
    if (!answer.answer_value || answer.answer_value.trim() === '') continue

    const questionInfo = findQuestion(answer.question_id)
    if (!questionInfo || !isCommentStyle(questionInfo.responseStyle)) continue

    comments.push({
      id: answer.id,
      answerId: answer.id,
      questionText: questionInfo.question,
      submittedAt: response.value.submitted_at,
      comment: answer.answer_value,
      deanName,
    })
  }

  return comments
})

// Helper: Format date
const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Get dean name
const getDeanName = (): string => {
  if (!response.value) return '-'
  if (typeof response.value.dean_id === 'object' && response.value.dean_id) {
    return `${response.value.dean_id.first_name} ${response.value.dean_id.last_name}`
  }
  return `Dean #${response.value.dean_id}`
}

// Fetch data
const fetchData = async () => {
  isLoading.value = true
  try {
    await Promise.all([
      fetchSurvey(),
      fetchProfessor(),
      fetchResponse(),
    ])
  }
  catch (error) {
    console.error('Failed to fetch data:', error)
  }
  finally {
    isLoading.value = false
  }
}

const fetchSurvey = async () => {
  try {
    const res = await $api(`/items/DeanEvaluationSurvey/${surveyId.value}`, {
      params: {
        fields: ['id', 'title', 'question_groups.*', 'question_groups.questions.*', 'academic_term_id.*'],
      },
    })
    const data = res.data
    survey.value = {
      id: data.id,
      title: data.title,
      question_groups: data.question_groups || [],
      academic_term: data.academic_term_id || null,
    }
  }
  catch (error) {
    console.error('Failed to fetch survey:', error)
  }
}

const fetchProfessor = async () => {
  try {
    const res = await $api(`/items/Teachers/${professorId.value}`, {
      params: {
        fields: ['id', 'first_name', 'last_name'],
      },
    })
    if (res.data) {
      professor.value = {
        id: res.data.id,
        first_name: res.data.first_name,
        last_name: res.data.last_name,
      }
    }
  }
  catch (error) {
    console.error('Failed to fetch professor:', error)
  }
}

const fetchResponse = async () => {
  try {
    const res = await $api('/items/DeanSurveyResponses', {
      params: {
        filter: {
          _and: [
            { survey_id: { _eq: surveyId.value } },
            { evaluated_teached_id: { _eq: professorId.value } },
          ],
        },
        fields: ['*', 'dean_id.*', 'answers.*', 'answers.question_id.*'],
        limit: 1,
      },
    })
    response.value = res.data?.[0] || null
  }
  catch (error) {
    console.error('Failed to fetch response:', error)
  }
}

// Comment actions
const openEditComment = (comment: CommentData) => {
  editingComment.value = comment
  editedCommentText.value = comment.comment
  isEditCommentDialogOpen.value = true
}

const saveComment = async () => {
  if (!editingComment.value) return

  isSavingComment.value = true
  try {
    await $api(`/items/DeanSurveyAnswer/${editingComment.value.answerId}`, {
      method: 'PATCH',
      body: {
        answer_value: editedCommentText.value.trim() || '',
      },
    })

    // Update local state
    if (response.value?.answers) {
      const answer = response.value.answers.find(a => a.id === editingComment.value?.answerId)
      if (answer) {
        answer.answer_value = editedCommentText.value.trim() || ''
      }
    }

    isEditCommentDialogOpen.value = false
    editingComment.value = null
  }
  catch (error) {
    console.error('Failed to save comment:', error)
  }
  finally {
    isSavingComment.value = false
  }
}

const openDeleteComment = (comment: CommentData) => {
  editingComment.value = comment
  isDeleteCommentDialogOpen.value = true
}

const deleteComment = async () => {
  if (!editingComment.value) return

  isSavingComment.value = true
  try {
    await $api(`/items/DeanSurveyAnswer/${editingComment.value.answerId}`, {
      method: 'PATCH',
      body: {
        answer_value: '',
      },
    })

    // Update local state - clear the answer value
    if (response.value?.answers) {
      const answer = response.value.answers.find(a => a.id === editingComment.value?.answerId)
      if (answer) {
        answer.answer_value = ''
      }
    }

    isDeleteCommentDialogOpen.value = false
    editingComment.value = null
  }
  catch (error) {
    console.error('Failed to delete comment:', error)
  }
  finally {
    isSavingComment.value = false
  }
}

const goBack = () => {
  router.push(`/surveys/dean-evaluation/${surveyId.value}`)
}

// Export/Print Report as PDF
const printReport = () => {
  if (!professor.value || !survey.value || !response.value) return

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Please allow pop-ups to print the report')
    return
  }

  // Get semester info
  const semester = survey.value.academic_term
    ? `${survey.value.academic_term.semester} ${survey.value.academic_term.schoolYear}`
    : 'N/A'

  // Build single unified question table
  const allQuestionRows = questionStatistics.value.map(group => {
    const questions = group.questions || []
    if (questions.length === 0) return ''

    const questionRows = questions.map(q => {
      return `
        <tr>
          <td class="question-cell">${q.questionText}</td>
          <td class="rating-cell">${q.answerValue}</td>
        </tr>
      `
    }).join('')

    return `
      <tr>
        <td class="group-title-cell" colspan="2">${group.groupTitle}</td>
      </tr>
      ${questionRows}
    `
  }).join('')

  const questionTablesHtml = `
    <table class="evaluation-table">
      <thead>
        <tr>
          <th class="question-header">Questions</th>
          <th class="rating-header">Rating</th>
        </tr>
      </thead>
      <tbody>
        ${allQuestionRows}
      </tbody>
    </table>
  `

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Dean Evaluation Report - ${professor.value.first_name} ${professor.value.last_name}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Times New Roman', Times, serif; font-size: 11px; line-height: 1.4; padding: 40px; }

        .header-section { text-align: center; margin-bottom: 25px; }
        .header-section h1 { font-size: 16px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; }

        .info-table { width: 100%; margin-bottom: 20px; border-collapse: collapse; }
        .info-table td { padding: 5px 10px; vertical-align: top; }
        .info-label { font-weight: bold; width: 120px; }
        .info-value { }

        .rating-scale { background: #f9f9f9; padding: 15px; margin-bottom: 25px; border: 1px solid #ddd; }
        .rating-scale h3 { font-size: 12px; margin-bottom: 10px; }
        .scale-note { margin-bottom: 10px; font-size: 11px; }
        .scale-row { display: flex; flex-wrap: wrap; gap: 15px; }
        .scale-item { font-size: 11px; white-space: nowrap; }

        .evaluation-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10px; }
        .evaluation-table th, .evaluation-table td { border: 1px solid #333; padding: 6px 8px; }

        .group-title-cell {
          background: #333;
          color: white;
          font-weight: bold;
          text-align: left;
          font-size: 11px;
          padding: 8px;
        }

        .question-header {
          background: #f0f0f0;
          font-weight: bold;
          text-align: left;
          width: 80%;
        }

        .rating-header {
          background: #f0f0f0;
          font-weight: bold;
          text-align: center;
          width: 20%;
        }

        .question-cell {
          text-align: left;
          font-size: 10px;
        }

        .rating-cell {
          text-align: center;
          font-weight: bold;
          font-size: 10px;
        }

        .footer { margin-top: 30px; text-align: center; font-size: 9px; color: #666; }

        @media print {
          body { padding: 20px; }
          .evaluation-table { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header-section">
        <h1>Dean Evaluation Report</h1>
      </div>

      <table class="info-table">
        <tr>
          <td class="info-label">Faculty Member:</td>
          <td class="info-value">${professor.value.first_name} ${professor.value.last_name}</td>
        </tr>
        <tr>
          <td class="info-label">Evaluated By:</td>
          <td class="info-value">${getDeanName()}</td>
        </tr>
        <tr>
          <td class="info-label">Semester:</td>
          <td class="info-value">${semester}</td>
        </tr>
        <tr>
          <td class="info-label">Survey:</td>
          <td class="info-value">${survey.value.title}</td>
        </tr>
      </table>

      <div class="rating-scale">
        <h3>Rating Scale Description</h3>
        <p class="scale-note">The rating ranges from 1-5, with 5 being the highest and 1 being the lowest score.</p>
        <div class="scale-row">
          <span class="scale-item"><strong>5</strong> - Outstanding</span>
          <span class="scale-item"><strong>4</strong> - Very Satisfactory</span>
          <span class="scale-item"><strong>3</strong> - Satisfactory</span>
          <span class="scale-item"><strong>2</strong> - Unsatisfactory</span>
          <span class="scale-item"><strong>1</strong> - Poor</span>
        </div>
      </div>

      ${questionTablesHtml}

      <div class="footer">
        Generated on ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>
    </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.onload = () => {
    printWindow.print()
  }
}

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center gap-4 mb-6">
      <VBtn icon variant="text" @click="goBack">
        <VIcon icon="ri-arrow-left-line" />
      </VBtn>
      <div class="flex-grow-1">
        <h4 class="text-h5 font-weight-medium mb-1">
          {{ professor ? `${professor.first_name} ${professor.last_name}` : 'Loading...' }}
        </h4>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Dean Evaluation Results
          <span v-if="survey">- {{ survey.title }}</span>
        </p>
      </div>
      <VBtn
        v-if="!isLoading && professor && response"
        color="primary"
        variant="outlined"
        @click="printReport"
      >
        Export Report
      </VBtn>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="d-flex justify-center align-center pa-12">
      <VProgressCircular indeterminate color="primary" size="48" />
    </div>

    <template v-else>
      <!-- No Response Found -->
      <VCard v-if="!response" variant="outlined" class="mb-6">
        <VCardText class="text-center pa-12">
          <VIcon icon="ri-file-list-line" size="48" color="medium-emphasis" class="mb-4" />
          <p class="text-h6 text-medium-emphasis mb-2">No Evaluation Found</p>
          <p class="text-body-2 text-medium-emphasis mb-0">
            This professor has not been evaluated yet for this survey.
          </p>
        </VCardText>
      </VCard>

      <template v-else>
        <!-- Summary Info -->
        <VCard variant="outlined" class="mb-6">
          <VCardText class="pa-4">
            <div class="d-flex flex-wrap align-center gap-8">
              <div class="text-center">
                <div class="text-h5 font-weight-bold">{{ getDeanName() }}</div>
                <div class="text-caption text-medium-emphasis">Evaluated By</div>
              </div>
              <VDivider vertical class="align-self-stretch" />
              <div class="text-center">
                <div class="text-h5 font-weight-bold">{{ formatDate(response.submitted_at) }}</div>
                <div class="text-caption text-medium-emphasis">Submitted</div>
              </div>
            </div>
          </VCardText>
        </VCard>

        <!-- Question Statistics -->
        <VCard variant="outlined" class="mb-6">
          <VCardTitle class="pa-4 text-subtitle-1">
            Survey Questions & Ratings
          </VCardTitle>
          <VDivider />
          <VCardText class="pa-4">
            <template v-if="questionStatistics.length > 0">
              <div v-for="(group, groupIndex) in questionStatistics" :key="groupIndex" class="mb-6">
                <div class="d-flex align-center gap-2 mb-3">
                  <span class="text-subtitle-2">{{ group.groupNumber }}. {{ group.groupTitle }}</span>
                  <span class="text-caption text-medium-emphasis">({{ group.responseStyle }})</span>
                </div>

                <VTable density="compact" class="mb-4 border rounded">
                  <thead>
                    <tr>
                      <th style="width: 85%;">Question</th>
                      <th class="text-center" style="width: 15%;">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="question in group.questions" :key="question.questionId">
                      <td class="py-3">{{ question.questionText }}</td>
                      <td class="text-center">
                        <span
                          class="font-weight-medium"
                          :class="parseInt(question.answerValue) >= 4 ? 'text-success' : parseInt(question.answerValue) >= 3 ? 'text-warning' : parseInt(question.answerValue) >= 1 ? 'text-error' : 'text-medium-emphasis'"
                        >
                          {{ question.answerValue }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </VTable>
              </div>
            </template>
            <div v-else class="text-center text-medium-emphasis py-6">
              <p>No question statistics available</p>
            </div>
          </VCardText>
        </VCard>

        <!-- Comments -->
        <VCard variant="outlined">
          <VCardTitle class="pa-4 d-flex align-center justify-space-between">
            <span class="text-subtitle-1">Dean Comments</span>
            <span class="text-body-2 text-medium-emphasis">
              {{ allComments.length }} comment{{ allComments.length !== 1 ? 's' : '' }}
            </span>
          </VCardTitle>
          <VDivider />
          <VCardText class="pa-4">
            <template v-if="allComments.length > 0">
              <div class="d-flex flex-column gap-3">
                <VCard
                  v-for="comment in allComments"
                  :key="comment.id"
                  variant="flat"
                  class="pa-4 bg-grey-lighten-5"
                >
                  <div class="d-flex justify-space-between align-start mb-2">
                    <div class="d-flex align-center gap-3">
                      <span class="text-caption text-medium-emphasis">
                        {{ formatDate(comment.submittedAt) }}
                      </span>
                    </div>
                    <div class="d-flex gap-1">
                      <VBtn
                        icon
                        size="small"
                        variant="text"
                        color="primary"
                        @click="openEditComment(comment)"
                      >
                        <VIcon icon="ri-edit-line" size="18" />
                        <VTooltip activator="parent" location="top">Edit</VTooltip>
                      </VBtn>
                      <VBtn
                        icon
                        size="small"
                        variant="text"
                        color="error"
                        @click="openDeleteComment(comment)"
                      >
                        <VIcon icon="ri-delete-bin-line" size="18" />
                        <VTooltip activator="parent" location="top">Delete</VTooltip>
                      </VBtn>
                    </div>
                  </div>
                  <div class="text-body-2 mt-3 pa-3 bg-grey-lighten-4 rounded" style="font-style: italic;">
                    "{{ comment.comment }}"
                  </div>
                </VCard>
              </div>
            </template>
            <div v-else class="text-center text-medium-emphasis py-8">
              <VIcon icon="ri-chat-off-line" size="48" class="mb-2" />
              <p class="mb-0">No comments from dean</p>
            </div>
          </VCardText>
        </VCard>
      </template>
    </template>

    <!-- Edit Comment Dialog -->
    <VDialog v-model="isEditCommentDialogOpen" max-width="500">
      <VCard>
        <VCardTitle class="pa-4">Edit Comment</VCardTitle>
        <VDivider />
        <VCardText class="pa-4">
          <VTextarea
            v-model="editedCommentText"
            label="Comment"
            rows="4"
            counter
            auto-grow
          />
        </VCardText>
        <VDivider />
        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            :disabled="isSavingComment"
            @click="isEditCommentDialogOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :loading="isSavingComment"
            @click="saveComment"
          >
            Save
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Delete Comment Dialog -->
    <VDialog v-model="isDeleteCommentDialogOpen" max-width="400">
      <VCard>
        <VCardTitle class="pa-4">Delete Comment</VCardTitle>
        <VDivider />
        <VCardText class="pa-4">
          <p>Are you sure you want to delete this comment?</p>
          <VCard variant="outlined" class="mt-3 pa-3 bg-grey-lighten-4">
            <p class="text-body-2 mb-0" style="font-style: italic;">
              "{{ editingComment?.comment }}"
            </p>
          </VCard>
        </VCardText>
        <VDivider />
        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            :disabled="isSavingComment"
            @click="isDeleteCommentDialogOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="error"
            :loading="isSavingComment"
            @click="deleteComment"
          >
            Delete
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<style scoped>
.border {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>

<script setup lang="ts">
import { $api } from '@/utils/api'
import { YEAR_LEVEL_OPTIONS } from '@/utils/constants'

definePage({
  meta: {
    action: 'read',
    subject: 'surveys',
    allowedRoles: ['administrator'],
  },
})

interface StudentQuestion {
  id?: number
  question: string
  sort?: number
}

interface StudentSurveyGroup {
  id?: number
  number: number
  title: string
  response_style: string
  questions?: StudentQuestion[]
}

interface SurveyAnswer {
  id: number
  question_id: number | StudentQuestion
  answer_value: string
}

interface Student {
  id: number
  first_name: string
  last_name: string
  student_number: string
}

interface SurveyResponse {
  id: number
  survey_id: number
  student_id: Student | number
  class_id?: number
  submitted_at: string
  year_level?: string
  answers?: SurveyAnswer[]
}

interface ClassItem {
  id: number
  section: string
  course_id?: { id: number; courseCode: string; courseName: string } | number | null
  teacher_id?: { id: number; first_name: string; last_name: string } | number | null
  student_id?: { id: number }[]
}

interface CommentData {
  id: number
  answerId: number
  questionText: string
  submittedAt: string
  comment: string
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
  question_group: StudentSurveyGroup[]
  academic_term?: { id: number; schoolYear: string; semester: string } | null
} | null>(null)
const professor = ref<{ id: number; name: string } | null>(null)
const classes = ref<ClassItem[]>([])
const responses = ref<SurveyResponse[]>([])

// Comment editing state
const isEditCommentDialogOpen = ref(false)
const isDeleteCommentDialogOpen = ref(false)
const editingComment = ref<CommentData | null>(null)
const editedCommentText = ref('')
const isSavingComment = ref(false)

// Computed: Professor's overall stats
const professorStats = computed(() => {
  let totalResponses = 0
  let totalStudents = 0
  let totalSum = 0
  let totalCount = 0

  for (const classItem of classes.value) {
    const classResponses = responses.value.filter(r => r.class_id === classItem.id)
    totalResponses += classResponses.length
    totalStudents += classItem.student_id?.length || 0

    for (const response of classResponses) {
      if (!response.answers) continue
      for (const answer of response.answers) {
        const numVal = parseFloat(answer.answer_value)
        if (!isNaN(numVal) && numVal >= 1 && numVal <= 5) {
          totalSum += numVal
          totalCount++
        }
      }
    }
  }

  return {
    classCount: classes.value.length,
    responseCount: totalResponses,
    studentCount: totalStudents,
    averageRating: totalCount > 0 ? totalSum / totalCount : 0,
    responseRate: totalStudents > 0 ? Math.round((totalResponses / totalStudents) * 100) : 0,
  }
})

// Computed: Classes with evaluation data
const classesData = computed(() => {
  return classes.value.map((classItem) => {
    const classResponses = responses.value.filter(r => r.class_id === classItem.id)
    const studentCount = classItem.student_id?.length || 0

    let totalSum = 0
    let totalCount = 0
    for (const response of classResponses) {
      if (!response.answers) continue
      for (const answer of response.answers) {
        const numVal = parseFloat(answer.answer_value)
        if (!isNaN(numVal) && numVal >= 1 && numVal <= 5) {
          totalSum += numVal
          totalCount++
        }
      }
    }

    const courseInfo = typeof classItem.course_id === 'object' && classItem.course_id
      ? classItem.course_id
      : null

    return {
      classId: classItem.id,
      section: classItem.section,
      courseCode: courseInfo?.courseCode || '-',
      courseName: courseInfo?.courseName || '-',
      responseCount: classResponses.length,
      studentCount,
      responseRate: studentCount > 0 ? Math.round((classResponses.length / studentCount) * 100) : 0,
      averageRating: totalCount > 0 ? totalSum / totalCount : 0,
    }
  }).sort((a, b) => a.courseCode.localeCompare(b.courseCode))
})

// Computed: Responses by year level
const responsesByYearLevel = computed(() => {
  const stats: Record<string, {
    yearLevel: string
    yearLevelLabel: string
    totalResponses: number
    averageRating: number
    ratingSum: number
    ratingCount: number
  }> = {}

  for (const opt of YEAR_LEVEL_OPTIONS) {
    stats[opt.value] = {
      yearLevel: opt.value,
      yearLevelLabel: opt.title,
      totalResponses: 0,
      averageRating: 0,
      ratingSum: 0,
      ratingCount: 0,
    }
  }

  for (const response of responses.value) {
    const yearLevel = response.year_level || ''
    if (yearLevel && stats[yearLevel]) {
      stats[yearLevel].totalResponses++
      if (response.answers) {
        for (const answer of response.answers) {
          const numVal = parseFloat(answer.answer_value)
          if (!isNaN(numVal) && numVal >= 1 && numVal <= 5) {
            stats[yearLevel].ratingSum += numVal
            stats[yearLevel].ratingCount++
          }
        }
      }
    }
  }

  for (const key of Object.keys(stats)) {
    const stat = stats[key]
    if (stat.ratingCount > 0) {
      stat.averageRating = stat.ratingSum / stat.ratingCount
    }
  }

  return Object.values(stats).filter(s => s.totalResponses > 0)
})

// Helper: Check if response style is for comments (should be shown in Comments section, not Questions)
const isCommentStyle = (responseStyle: string): boolean => {
  if (!responseStyle) return false
  const lower = responseStyle.toLowerCase()
  return lower.includes('open') || lower.includes('comment') || lower.includes('text')
}

// Computed: Question statistics across all classes (excludes Comment/Open-Ended response styles)
const questionStatistics = computed(() => {
  if (!survey.value?.question_group) return []

  const stats: {
    groupTitle: string
    groupNumber: number
    responseStyle: string
    questions: {
      questionId: number
      questionText: string
      totalResponses: number
      average: number
      distribution: Record<string, number>
    }[]
  }[] = []

  for (const group of survey.value.question_group) {
    // Skip groups with Comment/Open-Ended response style - they show in Comments section
    if (isCommentStyle(group.response_style)) continue

    const groupStats: typeof stats[0] = {
      groupTitle: group.title,
      groupNumber: group.number,
      responseStyle: group.response_style,
      questions: [],
    }

    for (const question of group.questions || []) {
      const questionId = question.id || 0
      const distribution: Record<string, number> = {}
      let sum = 0
      let count = 0

      // Loop through all responses and find answers for this question
      for (const response of responses.value) {
        if (!response.answers) continue
        for (const answer of response.answers) {
          const ansQId = typeof answer.question_id === 'object'
            ? answer.question_id.id
            : answer.question_id

          if (ansQId === questionId) {
            const val = answer.answer_value
            distribution[val] = (distribution[val] || 0) + 1

            const numVal = parseFloat(val)
            if (!isNaN(numVal) && numVal >= 1 && numVal <= 5) {
              sum += numVal
              count++
            }
          }
        }
      }

      groupStats.questions.push({
        questionId,
        questionText: question.question,
        totalResponses: count,
        average: count > 0 ? sum / count : 0,
        distribution,
      })
    }

    if (groupStats.questions.length > 0) {
      stats.push(groupStats)
    }
  }

  return stats.sort((a, b) => a.groupNumber - b.groupNumber)
})

// Helper: Find question by ID and get its details
const findQuestion = (questionId: number | StudentQuestion): { question: string; responseStyle: string } | null => {
  const qId = typeof questionId === 'object' ? questionId.id : questionId
  if (!survey.value?.question_group) return null

  for (const group of survey.value.question_group) {
    for (const q of group.questions || []) {
      if (q.id === qId) {
        return { question: q.question, responseStyle: group.response_style }
      }
    }
  }
  return null
}

// Computed: All comments from Comment response style answers
const allComments = computed<CommentData[]>(() => {
  const comments: CommentData[] = []

  for (const response of responses.value) {
    if (!response.answers) continue

    for (const answer of response.answers) {
      // Skip if no answer value
      if (!answer.answer_value || answer.answer_value.trim() === '') continue

      // Find the question to check response_style
      const questionInfo = findQuestion(answer.question_id)
      if (!questionInfo || !isCommentStyle(questionInfo.responseStyle)) continue

      comments.push({
        id: answer.id,
        answerId: answer.id,
        questionText: questionInfo.question,
        submittedAt: response.submitted_at,
        comment: answer.answer_value,
      })
    }
  }

  return comments.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
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

// Fetch data
const fetchData = async () => {
  isLoading.value = true
  try {
    await Promise.all([
      fetchSurvey(),
      fetchProfessor(),
      fetchClasses(),
    ])
    await fetchResponses()
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
    const res = await $api(`/items/StudentEvaluationSurvey/${surveyId.value}`, {
      params: {
        fields: ['id', 'title', 'question_group.*', 'question_group.questions.*', 'academic_term_id.*'],
      },
    })
    const data = res.data
    survey.value = {
      id: data.id,
      title: data.title,
      question_group: data.question_group || [],
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
        name: `${res.data.first_name} ${res.data.last_name}`,
      }
    }
  }
  catch (error) {
    console.error('Failed to fetch professor:', error)
  }
}

const fetchClasses = async () => {
  try {
    // First get survey classes
    const surveyRes = await $api(`/items/StudentEvaluationSurvey/${surveyId.value}`, {
      params: {
        fields: ['classes.classes_id'],
      },
    })

    const surveyClassIds = surveyRes.data?.classes?.map((c: any) => c.classes_id) || []

    if (surveyClassIds.length === 0) {
      classes.value = []
      return
    }

    // Fetch classes for this professor within this survey
    const res = await $api('/items/classes', {
      params: {
        filter: {
          _and: [
            { id: { _in: surveyClassIds } },
            { teacher_id: { _eq: professorId.value } },
          ],
        },
        fields: ['id', 'section', 'course_id.id', 'course_id.courseCode', 'course_id.courseName', 'teacher_id.id', 'teacher_id.first_name', 'teacher_id.last_name', 'student_id.id'],
        limit: -1,
      },
    })
    classes.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch classes:', error)
  }
}

const fetchResponses = async () => {
  if (classes.value.length === 0) {
    responses.value = []
    return
  }

  try {
    const classIds = classes.value.map(c => c.id)
    const res = await $api('/items/StudentSurveyResponses', {
      params: {
        filter: {
          _and: [
            { survey_id: { _eq: surveyId.value } },
            { class_id: { _in: classIds } },
          ],
        },
        fields: ['*', 'year_level', 'student_id.*', 'answers.*', 'answers.question_id.*'],
        limit: -1,
      },
    })
    responses.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch responses:', error)
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
    await $api(`/items/StudentSurveyAnswers/${editingComment.value.answerId}`, {
      method: 'PATCH',
      body: {
        answer_value: editedCommentText.value.trim() || '',
      },
    })

    // Update local state - find the answer in responses
    for (const response of responses.value) {
      if (!response.answers) continue
      const answer = response.answers.find(a => a.id === editingComment.value?.answerId)
      if (answer) {
        answer.answer_value = editedCommentText.value.trim() || ''
        break
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
    await $api(`/items/StudentSurveyAnswers/${editingComment.value.answerId}`, {
      method: 'PATCH',
      body: {
        answer_value: '',
      },
    })

    // Update local state - find the answer in responses and clear it
    for (const response of responses.value) {
      if (!response.answers) continue
      const answer = response.answers.find(a => a.id === editingComment.value?.answerId)
      if (answer) {
        answer.answer_value = ''
        break
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
  router.push(`/surveys/student-evaluation/${surveyId.value}`)
}

// Helper: Get rating for a specific question in a specific class
const getQuestionRatingByClass = (questionId: number, classId: number): number => {
  const classResponses = responses.value.filter(r => r.class_id === classId)
  let sum = 0
  let count = 0

  for (const response of classResponses) {
    if (!response.answers) continue
    for (const answer of response.answers) {
      const ansQId = typeof answer.question_id === 'object'
        ? answer.question_id.id
        : answer.question_id

      if (ansQId === questionId) {
        const numVal = parseFloat(answer.answer_value)
        if (!isNaN(numVal) && numVal >= 1 && numVal <= 5) {
          sum += numVal
          count++
        }
      }
    }
  }

  return count > 0 ? sum / count : 0
}

// Export/Print Report as PDF
const printReport = () => {
  if (!professor.value || !survey.value) return

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Please allow pop-ups to print the report')
    return
  }

  // Get semester info
  const semester = survey.value.academic_term
    ? `${survey.value.academic_term.semester} ${survey.value.academic_term.schoolYear}`
    : 'N/A'

  // Build single unified question table with courses as columns
  const courseHeaders = classesData.value.map(c =>
    `<th class="course-header">${c.courseCode} - ${c.section}</th>`
  ).join('')

  // Build all question rows grouped by section (exclude comment-style groups)
  const allQuestionRows = (survey.value.question_group || [])
    .filter(group => !isCommentStyle(group.response_style))
    .map(group => {
    const questions = group.questions || []
    if (questions.length === 0) return ''

    const questionRows = questions.map(q => {
      const questionId = q.id || 0
      const ratingCells = classesData.value.map(c => {
        const rating = getQuestionRatingByClass(questionId, c.classId)
        return `<td class="rating-cell">${rating > 0 ? rating.toFixed(2) : '-'}</td>`
      }).join('')

      return `
        <tr>
          <td class="question-cell">${q.question}</td>
          ${ratingCells}
        </tr>
      `
    }).join('')

    return `
      <tr>
        <td class="group-title-cell" colspan="${classesData.value.length + 1}">${group.title}</td>
      </tr>
      ${questionRows}
    `
  }).join('')

  const questionTablesHtml = `
    <table class="evaluation-table">
      <thead>
        <tr>
          <th class="question-header">Questions</th>
          ${courseHeaders}
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
      <title>Faculty Evaluation Report - ${professor.value.name}</title>
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
          width: 50%;
        }

        .course-header {
          background: #f0f0f0;
          text-align: center;
          padding: 8px;
          vertical-align: middle;
          font-weight: bold;
          font-size: 10px;
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
        <h1>Faculty Evaluation Report</h1>
      </div>

      <table class="info-table">
        <tr>
          <td class="info-label">Professor:</td>
          <td class="info-value">${professor.value.name}</td>
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
          <span class="scale-item"><strong>5</strong> - Very Satisfied</span>
          <span class="scale-item"><strong>4</strong> - Satisfied</span>
          <span class="scale-item"><strong>3</strong> - Neutral</span>
          <span class="scale-item"><strong>2</strong> - Dissatisfied</span>
          <span class="scale-item"><strong>1</strong> - Very Dissatisfied</span>
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
          {{ professor?.name || 'Loading...' }}
        </h4>
        <p class="text-body-2 text-medium-emphasis mb-0">
          Faculty Evaluation Results
          <span v-if="survey">- {{ survey.title }}</span>
        </p>
      </div>
      <VBtn
        v-if="!isLoading && professor"
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
      <!-- Summary Stats -->
      <VCard variant="outlined" class="mb-6">
        <VCardText class="pa-4">
          <div class="d-flex flex-wrap align-center justify-space-between gap-4">
            <div class="d-flex align-center gap-8">
              <div class="text-center">
                <div class="text-h5 font-weight-bold">{{ professorStats.classCount }}</div>
                <div class="text-caption text-medium-emphasis">Classes</div>
              </div>
              <VDivider vertical class="align-self-stretch" />
              <div class="text-center">
                <div class="text-h5 font-weight-bold">{{ professorStats.responseCount }}/{{ professorStats.studentCount }}</div>
                <div class="text-caption text-medium-emphasis">Responses</div>
              </div>
              <VDivider vertical class="align-self-stretch" />
              <div class="text-center">
                <div class="text-h5 font-weight-bold">{{ professorStats.responseRate }}%</div>
                <div class="text-caption text-medium-emphasis">Response Rate</div>
              </div>
            </div>
            <div class="text-right">
              <p class="text-h4 font-weight-bold mb-0">
                {{ professorStats.averageRating.toFixed(2) }}
              </p>
              <p class="text-caption text-medium-emphasis">Overall Rating</p>
            </div>
          </div>
        </VCardText>
      </VCard>

      <!-- Classes Table -->
      <VCard variant="outlined" class="mb-6">
        <VCardTitle class="pa-4 text-subtitle-1">
          Classes & Evaluation Results
        </VCardTitle>
        <VDivider />
        <VCardText class="pa-0">
          <VTable density="comfortable">
            <thead>
              <tr>
                <th>Course</th>
                <th>Section</th>
                <th class="text-center">Responses</th>
                <th class="text-center">Rate</th>
                <th class="text-center">Rating</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="classData in classesData" :key="classData.classId">
                <td>
                  <div>
                    <span class="font-weight-medium">{{ classData.courseCode }}</span>
                    <div class="text-caption text-medium-emphasis">
                      {{ classData.courseName }}
                    </div>
                  </div>
                </td>
                <td>{{ classData.section }}</td>
                <td class="text-center">
                  {{ classData.responseCount }}/{{ classData.studentCount }}
                </td>
                <td class="text-center">
                  {{ classData.responseRate }}%
                </td>
                <td class="text-center">
                  <span
                    v-if="classData.averageRating > 0"
                    class="font-weight-medium"
                    :class="classData.averageRating >= 4 ? 'text-success' : classData.averageRating >= 3 ? 'text-warning' : 'text-error'"
                  >
                    {{ classData.averageRating.toFixed(2) }}
                  </span>
                  <span v-else class="text-medium-emphasis">-</span>
                </td>
              </tr>
            </tbody>
          </VTable>
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
                        :class="question.average >= 4 ? 'text-success' : question.average >= 3 ? 'text-warning' : 'text-error'"
                      >
                        {{ question.average.toFixed(2) }}
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

      <!-- Student Comments -->
      <VCard variant="outlined">
        <VCardTitle class="pa-4 d-flex align-center justify-space-between">
          <span class="text-subtitle-1">Student Comments</span>
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
            <p class="mb-0">No comments from students</p>
          </div>
        </VCardText>
      </VCard>
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

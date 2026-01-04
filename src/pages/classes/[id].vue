<script setup lang="ts">
import { $api } from '@/utils/api'
import { YEAR_LEVEL_OPTIONS } from '@/utils/constants'

definePage({
  meta: {
    action: 'read',
    subject: 'classes',
    allowedRoles: ['administrator'],
  },
})

interface AcademicTerm {
  id: number
  schoolYear: string
  semester: string
  status: string
}

interface Course {
  id: number
  courseCode: string
  courseName: string
}

interface Department {
  id: number
  name: { id: number; programName: string; programCode: string } | number | null
}

interface Student {
  id: number
  student_number: string
  first_name: string
  middle_name: string
  last_name: string
  email: string
  gender: string
  is_active: string
}

interface Teacher {
  id: number
  first_name: string
  middle_name: string
  last_name: string
  position: string
}

interface ClassItem {
  id: number
  acadTerm_id: number | AcademicTerm | null
  course_id: number | Course | null
  section: string
  student_id?: any[]
  department_id: any[]
  teacher_id?: number | Teacher | null
  year_level?: string
}

const route = useRoute()
const router = useRouter()

const classId = computed(() => Number((route.params as { id: string }).id))

// State
const classData = ref<ClassItem | null>(null)
const students = ref<Student[]>([])
const departments = ref<Department[]>([])
const isLoading = ref(true)
const search = ref('')

// Add Student Dialog State
const isAddStudentDialogOpen = ref(false)
const availableStudents = ref<Student[]>([])
const selectedStudentIds = ref<number[]>([])
const studentSearch = ref('')
const isLoadingStudents = ref(false)
const isAddingStudents = ref(false)

// Table headers for students
const headers = [
  { title: 'ID', key: 'id', sortable: true, width: '80px' },
  { title: 'Student No.', key: 'student_number', sortable: true },
  { title: 'Name', key: 'name', sortable: true },
  { title: 'Gender', key: 'gender', sortable: true },
  { title: 'Email', key: 'email', sortable: true },
  { title: 'Status', key: 'is_active', sortable: true, align: 'center' as const },
]

// Get student full name
const getFullName = (student: Student) => {
  const middle = student.middle_name ? ` ${student.middle_name}.` : ''
  return `${student.last_name}, ${student.first_name}${middle}`
}

// Filtered students based on search
const filteredStudents = computed(() => {
  if (!search.value.trim()) return students.value

  const searchTerm = search.value.toLowerCase().trim()
  return students.value.filter(student => {
    const fullName = getFullName(student).toLowerCase()
    const studentNo = (student.student_number || '').toLowerCase()
    const email = (student.email || '').toLowerCase()
    const gender = (student.gender || '').toLowerCase()

    return fullName.includes(searchTerm)
      || studentNo.includes(searchTerm)
      || email.includes(searchTerm)
      || gender.includes(searchTerm)
  })
})

// Get academic term display
const getAcademicTerm = (): string => {
  if (!classData.value)
    return '-'
  if (typeof classData.value.acadTerm_id === 'object' && classData.value.acadTerm_id !== null)
    return `${classData.value.acadTerm_id.schoolYear} - ${classData.value.acadTerm_id.semester}`
  return '-'
}

// Get academic term status
const getAcademicTermStatus = (): string => {
  if (!classData.value)
    return ''
  if (typeof classData.value.acadTerm_id === 'object' && classData.value.acadTerm_id !== null)
    return classData.value.acadTerm_id.status
  return ''
}

// Get course display
const getCourseCode = (): string => {
  if (!classData.value)
    return '-'
  if (typeof classData.value.course_id === 'object' && classData.value.course_id !== null)
    return classData.value.course_id.courseCode
  return '-'
}

// Get course name
const getCourseName = (): string => {
  if (!classData.value)
    return ''
  if (typeof classData.value.course_id === 'object' && classData.value.course_id !== null)
    return classData.value.course_id.courseName
  return ''
}

// Get year level display
const getYearLevel = (): string => {
  if (!classData.value?.year_level)
    return '-'
  const option = YEAR_LEVEL_OPTIONS.find(o => o.value === classData.value?.year_level)
  return option?.title || '-'
}

// Get department display
const getDepartment = (): string => {
  if (!classData.value || !classData.value.department_id || !Array.isArray(classData.value.department_id) || classData.value.department_id.length === 0)
    return '-'

  const item = classData.value.department_id[0]
  let deptId: number | null = null

  if (typeof item === 'number') {
    deptId = item
  }
  else if (typeof item === 'object' && item !== null) {
    deptId = (item as any).Department_id || (item as any).id || null
  }

  if (deptId) {
    const dept = departments.value.find((d: Department) => d.id === deptId)
    if (dept && typeof dept.name === 'object' && dept.name !== null)
      return `${dept.name.programCode} - ${dept.name.programName}`
  }

  return '-'
}

// Get teacher display
const getTeacher = (): string => {
  if (!classData.value)
    return '-'
  if (typeof classData.value.teacher_id === 'object' && classData.value.teacher_id !== null) {
    const teacher = classData.value.teacher_id
    const middle = teacher.middle_name ? ` ${teacher.middle_name.charAt(0)}.` : ''

    return `${teacher.last_name}, ${teacher.first_name}${middle}`
  }

  return '-'
}

// Fetch class details
const fetchClassDetails = async () => {
  isLoading.value = true
  try {
    const res = await $api(`/items/classes/${classId.value}`, {
      params: {
        fields: [
          '*',
          'acadTerm_id.*',
          'course_id.*',
          'department_id.*',
          'teacher_id.*',
          'student_id.students_id.*',
        ],
      },
    })

    classData.value = res.data

    // Extract students from junction table
    if (res.data?.student_id && Array.isArray(res.data.student_id)) {
      students.value = res.data.student_id
        .map((item: any) => item.students_id)
        .filter((s: any) => s !== null && s !== undefined)
    }
  }
  catch (error) {
    console.error('Failed to fetch class details:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Fetch departments for display
const fetchDepartments = async () => {
  try {
    const res = await $api('/items/Department', {
      params: {
        fields: ['id', 'name.id', 'name.programName', 'name.programCode'],
      },
    })
    departments.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch departments:', error)
  }
}

// Get department code for export
const getDepartmentCode = (): string => {
  if (!classData.value || !classData.value.department_id || !Array.isArray(classData.value.department_id) || classData.value.department_id.length === 0)
    return ''

  const item = classData.value.department_id[0]
  let deptId: number | null = null

  if (typeof item === 'number') {
    deptId = item
  }
  else if (typeof item === 'object' && item !== null) {
    deptId = (item as any).Department_id || (item as any).id || null
  }

  if (deptId) {
    const dept = departments.value.find((d: Department) => d.id === deptId)
    if (dept && typeof dept.name === 'object' && dept.name !== null)
      return dept.name.programCode
  }

  return ''
}

// Get teacher name in "First Last" format for export
const getTeacherNameForExport = (): string => {
  if (!classData.value)
    return ''
  if (typeof classData.value.teacher_id === 'object' && classData.value.teacher_id !== null) {
    const teacher = classData.value.teacher_id
    return `${teacher.first_name} ${teacher.last_name}`
  }
  return ''
}

// Get semester in import-compatible format (e.g., "FIRST SEMESTER 2025-2026")
const getSemesterForExport = (): string => {
  if (!classData.value)
    return ''
  if (typeof classData.value.acadTerm_id === 'object' && classData.value.acadTerm_id !== null) {
    const term = classData.value.acadTerm_id
    // Convert "First Semester" to "FIRST SEMESTER"
    const semesterUpper = term.semester.toUpperCase()
    return `${semesterUpper} ${term.schoolYear}`
  }
  return ''
}

// Export students to CSV
const exportToCSV = () => {
  if (!classData.value || students.value.length === 0)
    return

  const courseCode = getCourseCode()
  const courseName = getCourseName()
  const section = classData.value.section
  const semesterLine = getSemesterForExport()
  const deptCode = getDepartmentCode()
  const teacherName = getTeacherNameForExport()
  const yearLevel = classData.value.year_level || ''

  // Build CSV content in the same format as import expects
  const lines: string[] = []

  // Header info (9 columns to match import format)
  lines.push(`${deptCode ? deptCode.toUpperCase() : 'DEPARTMENT'},,,,,,,,`)
  lines.push('CLASS LIST,,,,,,,,')
  lines.push(',,,,,,,,')
  lines.push(',,,,,,,,')
  lines.push(`${semesterLine},,,,,,,,`)
  lines.push(',,,,,,,,')
  lines.push(`,${courseCode} - ${courseName},,,,,,,`)
  lines.push(`,${section},,,,,,,`)
  if (teacherName) {
    lines.push(`,${teacherName},,,,,,,`)
  }
  lines.push(',,,,,,,,')
  lines.push(',,,,,,,,')

  // Student table header (9 columns)
  lines.push('No.,Student No.,Last Name,First Name,MI,Gender,Email,Year Level,Program/Section')

  // Student data (9 columns)
  students.value.forEach((student: Student, index: number) => {
    const middleInitial = student.middle_name ? student.middle_name.charAt(0) : ''
    const gender = student.gender || ''
    const email = student.email || ''
    lines.push(`${index + 1},${student.student_number},${student.last_name},${student.first_name},${middleInitial},${gender},${email},${yearLevel},${section}`)
  })

  // Create CSV content
  const csvContent = lines.join('\n')

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', `ClassList_${courseCode}_${section}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// === ADD STUDENT FUNCTIONS ===

// Get IDs of students already in this class
const enrolledStudentIds = computed(() => {
  return students.value.map(s => s.id)
})

// Filter available students based on search
const filteredAvailableStudents = computed(() => {
  if (!studentSearch.value.trim()) return availableStudents.value

  const searchTerm = studentSearch.value.toLowerCase().trim()
  return availableStudents.value.filter(student => {
    const fullName = `${student.last_name}, ${student.first_name}`.toLowerCase()
    const studentNo = (student.student_number || '').toLowerCase()
    const email = (student.email || '').toLowerCase()

    return fullName.includes(searchTerm)
      || studentNo.includes(searchTerm)
      || email.includes(searchTerm)
  })
})

// Open add student dialog
const openAddStudentDialog = async () => {
  isAddStudentDialogOpen.value = true
  selectedStudentIds.value = []
  studentSearch.value = ''
  await fetchAvailableStudents()
}

// Fetch students not already in this class
const fetchAvailableStudents = async () => {
  isLoadingStudents.value = true
  try {
    const res = await $api('/items/students', {
      params: {
        fields: ['id', 'student_number', 'first_name', 'middle_name', 'last_name', 'email', 'gender', 'is_active'],
        filter: {
          is_active: { _eq: 'Active' },
        },
        limit: -1,
        sort: ['last_name', 'first_name'],
      },
    })

    // Filter out students already in this class
    availableStudents.value = (res.data || []).filter(
      (s: Student) => !enrolledStudentIds.value.includes(s.id)
    )
  }
  catch (error) {
    console.error('Failed to fetch available students:', error)
    availableStudents.value = []
  }
  finally {
    isLoadingStudents.value = false
  }
}

// Toggle student selection
const toggleStudentSelection = (studentId: number) => {
  const index = selectedStudentIds.value.indexOf(studentId)
  if (index === -1) {
    selectedStudentIds.value.push(studentId)
  }
  else {
    selectedStudentIds.value.splice(index, 1)
  }
}

// Check if student is selected
const isStudentSelected = (studentId: number) => {
  return selectedStudentIds.value.includes(studentId)
}

// Add selected students to class
const addStudentsToClass = async () => {
  if (selectedStudentIds.value.length === 0) return

  isAddingStudents.value = true
  try {
    // For each selected student, add this class to their class associations
    for (const studentId of selectedStudentIds.value) {
      // Get current class associations with full junction table data
      const studentRes = await $api(`/items/students/${studentId}`, {
        params: { fields: ['class_id.*'] },
      })

      const existingEntries = studentRes.data?.class_id || []

      // Check if already associated with this class
      const alreadyAssociated = existingEntries.some((item: any) => {
        const cId = item.classes_id || item.id || item
        return cId === classId.value
      })

      if (!alreadyAssociated) {
        // Preserve existing junction entries (with their IDs) and add new one
        const updatedClassIds = [
          ...existingEntries.map((item: any) => {
            // Keep existing entries with their junction table IDs
            if (typeof item === 'object' && item !== null && item.id) {
              return { id: item.id, classes_id: item.classes_id }
            }
            // Handle plain class IDs
            return { classes_id: typeof item === 'number' ? item : item.classes_id || item.id }
          }),
          { classes_id: classId.value }, // Add new class without junction ID
        ]

        await $api(`/items/students/${studentId}`, {
          method: 'PATCH',
          body: {
            class_id: updatedClassIds,
          },
        })
      }
    }

    // Close dialog and refresh
    isAddStudentDialogOpen.value = false
    await fetchClassDetails()
  }
  catch (error) {
    console.error('Failed to add students to class:', error)
    alert('Failed to add students to class')
  }
  finally {
    isAddingStudents.value = false
  }
}

// Fetch data on mount
onMounted(() => {
  fetchDepartments()
  fetchClassDetails()
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center mb-6">
      <div>
        <h4 class="text-h4">
          Class Details
        </h4>
        <p class="text-body-2 text-medium-emphasis mb-0">
          View class information and enrolled students
        </p>
      </div>
    </div>

    <!-- Loading State -->
    <VCard v-if="isLoading">
      <VCardText class="d-flex justify-center align-center pa-12">
        <VProgressCircular
          indeterminate
          color="primary"
        />
        <span class="ms-4">Loading class details...</span>
      </VCardText>
    </VCard>

    <!-- Class Details -->
    <template v-else-if="classData">
      <!-- Class Info Card -->
      <VCard class="mb-6">
        <VCardText class="pa-6">
          <VRow>
            <VCol
              cols="12"
              sm="6"
              md="3"
            >
              <div class="text-overline text-medium-emphasis mb-1">
                Section
              </div>
              <div class="text-h5 font-weight-medium">
                {{ classData.section }}
              </div>
            </VCol>
            <VCol
              cols="12"
              sm="6"
              md="3"
            >
              <div class="text-overline text-medium-emphasis mb-1">
                Course
              </div>
              <div class="text-body-1 font-weight-medium">
                {{ getCourseCode() }}
              </div>
              <div class="text-body-2 text-medium-emphasis">
                {{ getCourseName() }}
              </div>
            </VCol>
            <VCol
              cols="12"
              sm="6"
              md="3"
            >
              <div class="text-overline text-medium-emphasis mb-1">
                Academic Term
              </div>
              <div class="d-flex align-center gap-2">
                <span class="text-body-1">{{ getAcademicTerm() }}</span>
                <VChip
                  v-if="getAcademicTermStatus()"
                  :color="getAcademicTermStatus() === 'Active' ? 'success' : getAcademicTermStatus() === 'Draft' ? 'warning' : 'secondary'"
                  size="x-small"
                >
                  {{ getAcademicTermStatus() }}
                </VChip>
              </div>
            </VCol>
            <VCol
              cols="12"
              sm="6"
              md="3"
            >
              <div class="text-overline text-medium-emphasis mb-1">
                Year Level
              </div>
              <VChip
                v-if="classData.year_level"
                color="info"
                size="small"
                variant="tonal"
              >
                {{ getYearLevel() }}
              </VChip>
              <span v-else class="text-body-1">-</span>
            </VCol>
          </VRow>
          <VRow class="mt-4">
            <VCol
              cols="12"
              sm="6"
              md="3"
            >
              <div class="text-overline text-medium-emphasis mb-1">
                Department
              </div>
              <div class="text-body-1">
                {{ getDepartment() || '-' }}
              </div>
            </VCol>
            <VCol
              cols="12"
              sm="6"
              md="3"
            >
              <div class="text-overline text-medium-emphasis mb-1">
                Teacher
              </div>
              <div class="text-body-1">
                {{ getTeacher() }}
              </div>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>

      <!-- Students List Card -->
      <VCard>
        <VCardTitle class="d-flex align-center pa-6">
          <span class="text-h5">Enrolled Students</span>
          <VChip
            color="primary"
            size="small"
            class="ms-2"
          >
            {{ students.length }}
          </VChip>
          <VSpacer />
          <VTextField
            v-model="search"
            prepend-inner-icon="ri-search-line"
            placeholder="Search students..."
            density="compact"
            variant="outlined"
            hide-details
            class="me-4"
            style="max-width: 300px;"
          />
          <VBtn
            color="primary"
            variant="tonal"
            prepend-icon="ri-user-add-line"
            class="me-2"
            @click="openAddStudentDialog"
          >
            Add Student
          </VBtn>
          <VBtn
            color="secondary"
            variant="outlined"
            prepend-icon="ri-download-2-line"
            :disabled="students.length === 0"
            @click="exportToCSV"
          >
            Export CSV
          </VBtn>
        </VCardTitle>

        <VDivider />

        <VDataTable
          :headers="headers"
          :items="filteredStudents"
          hover
          item-value="id"
        >
          <template #item.id="{ item }">
            <span class="text-medium-emphasis">{{ item.id }}</span>
          </template>

          <template #item.student_number="{ item }">
            <span class="font-weight-medium">{{ item.student_number }}</span>
          </template>

          <template #item.name="{ item }">
            <div class="d-flex align-center gap-2">
              <VAvatar
                size="32"
                :color="item.gender === 'M' ? 'info' : item.gender === 'F' ? 'error' : 'secondary'"
                variant="tonal"
              >
                <span class="text-body-2">{{ item.first_name?.[0] }}{{ item.last_name?.[0] }}</span>
              </VAvatar>
              <span>{{ getFullName(item) }}</span>
            </div>
          </template>

          <template #item.gender="{ item }">
            <span v-if="item.gender">{{ item.gender }}</span>
            <span
              v-else
              class="text-medium-emphasis"
            >-</span>
          </template>

          <template #item.email="{ item }">
            <span
              v-if="item.email"
              class="text-body-2"
            >{{ item.email }}</span>
            <span
              v-else
              class="text-medium-emphasis"
            >-</span>
          </template>

          <template #item.is_active="{ item }">
            <VChip
              v-if="item.is_active"
              :color="item.is_active === 'Active' ? 'success' : item.is_active === 'Draft' ? 'warning' : 'secondary'"
              size="small"
              variant="tonal"
            >
              {{ item.is_active }}
            </VChip>
            <span
              v-else
              class="text-medium-emphasis"
            >-</span>
          </template>

          <template #no-data>
            <div class="text-center pa-8">
              <VIcon
                icon="ri-user-line"
                size="48"
                class="text-medium-emphasis mb-4"
              />
              <p class="text-body-1 text-medium-emphasis mb-0">
                No students enrolled in this class
              </p>
            </div>
          </template>
        </VDataTable>
      </VCard>
    </template>

    <!-- Error State -->
    <VCard v-else>
      <VCardText class="text-center pa-12">
        <VIcon
          icon="ri-error-warning-line"
          size="48"
          class="text-error mb-4"
        />
        <p class="text-body-1 mb-4">
          Failed to load class details
        </p>
        <VBtn
          color="primary"
          @click="fetchClassDetails"
        >
          Try Again
        </VBtn>
      </VCardText>
    </VCard>

    <!-- Add Student Dialog -->
    <VDialog v-model="isAddStudentDialogOpen" max-width="700" scrollable>
      <VCard>
        <VCardTitle class="pa-4">
          <div class="d-flex align-center">
            <VIcon icon="ri-user-add-line" class="me-2" />
            Add Students to Class
          </div>
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-4">
          <!-- Search -->
          <VTextField
            v-model="studentSearch"
            prepend-inner-icon="ri-search-line"
            placeholder="Search by name, student number, or email..."
            density="compact"
            variant="outlined"
            hide-details
            class="mb-4"
          />

          <!-- Selected count -->
          <div v-if="selectedStudentIds.length > 0" class="mb-3">
            <VChip color="primary" size="small" variant="tonal">
              {{ selectedStudentIds.length }} student(s) selected
            </VChip>
          </div>

          <!-- Loading -->
          <div v-if="isLoadingStudents" class="text-center pa-8">
            <VProgressCircular indeterminate color="primary" />
            <p class="mt-4 text-medium-emphasis">Loading students...</p>
          </div>

          <!-- Student List -->
          <template v-else>
            <div v-if="availableStudents.length === 0" class="text-center pa-8">
              <VIcon icon="ri-user-line" size="48" color="medium-emphasis" class="mb-4" />
              <p class="text-body-1 text-medium-emphasis">No available students to add</p>
              <p class="text-body-2 text-medium-emphasis">All active students are already enrolled in this class</p>
            </div>

            <div v-else-if="filteredAvailableStudents.length === 0" class="text-center pa-8">
              <VIcon icon="ri-search-line" size="48" color="medium-emphasis" class="mb-4" />
              <p class="text-body-1 text-medium-emphasis">No students match your search</p>
            </div>

            <VList v-else density="compact" class="student-list" style="max-height: 400px; overflow-y: auto;">
              <VListItem
                v-for="student in filteredAvailableStudents"
                :key="student.id"
                :class="{ 'bg-primary-lighten-5': isStudentSelected(student.id) }"
                @click="toggleStudentSelection(student.id)"
              >
                <template #prepend>
                  <VCheckbox
                    :model-value="isStudentSelected(student.id)"
                    hide-details
                    density="compact"
                    @click.stop="toggleStudentSelection(student.id)"
                  />
                </template>

                <VListItemTitle class="font-weight-medium">
                  {{ student.last_name }}, {{ student.first_name }}
                  <span v-if="student.middle_name" class="text-medium-emphasis">{{ student.middle_name.charAt(0) }}.</span>
                </VListItemTitle>

                <VListItemSubtitle>
                  <span class="text-primary">{{ student.student_number }}</span>
                  <span v-if="student.email" class="ms-2 text-medium-emphasis">• {{ student.email }}</span>
                </VListItemSubtitle>

                <template #append>
                  <VChip
                    v-if="student.gender"
                    :color="student.gender === 'M' ? 'info' : student.gender === 'F' ? 'error' : 'secondary'"
                    size="x-small"
                    variant="tonal"
                  >
                    {{ student.gender }}
                  </VChip>
                </template>
              </VListItem>
            </VList>
          </template>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <span class="text-body-2 text-medium-emphasis">
            {{ filteredAvailableStudents.length }} student(s) available
          </span>
          <VSpacer />
          <VBtn variant="outlined" @click="isAddStudentDialogOpen = false">
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :loading="isAddingStudents"
            :disabled="selectedStudentIds.length === 0"
            @click="addStudentsToClass"
          >
            Add {{ selectedStudentIds.length > 0 ? `(${selectedStudentIds.length})` : '' }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

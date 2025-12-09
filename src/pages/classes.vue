<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'classes',
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

interface ClassSection {
  id: number
  section: string[]
  program_id: { id: number; programCode: string } | number | null
}

interface Department {
  id: number
  name: { id: number; programName: string; programCode: string } | number | null
}

interface ClassItem {
  id?: number
  acadTerm_id: number | AcademicTerm | null
  course_id: number | Course | null
  section: string
  student_id?: number[]
  department_id: number[]
}

// State
const classes = ref<ClassItem[]>([])
const academicTerms = ref<AcademicTerm[]>([])
const courses = ref<Course[]>([])
const classSections = ref<ClassSection[]>([])
const departments = ref<Department[]>([])
const isLoading = ref(false)
const isDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const isEditing = ref(false)
const selectedClass = ref<ClassItem | null>(null)

const form = ref({
  id: undefined as number | undefined,
  acadTerm_id: null as number | null,
  course_id: null as number | null,
  section: '',
  department_id: null as number | null,
})

const search = ref('')
const departmentFilter = ref<number | null>(null)

// Table headers
const headers = [
  { title: 'Section', key: 'section', sortable: true },
  { title: 'Course', key: 'course', sortable: true },
  { title: 'Department', key: 'department', sortable: false },
  { title: 'Academic Term', key: 'acadTerm', sortable: true },
  { title: 'Students', key: 'studentCount', sortable: true, align: 'center' as const },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

// Get academic term display
const getAcademicTerm = (classItem: ClassItem): string => {
  if (typeof classItem.acadTerm_id === 'object' && classItem.acadTerm_id !== null)
    return `${classItem.acadTerm_id.schoolYear} - ${classItem.acadTerm_id.semester}`

  const term = academicTerms.value.find(t => t.id === classItem.acadTerm_id)
  return term ? `${term.schoolYear} - ${term.semester}` : '-'
}

// Get academic term status
const getAcademicTermStatus = (classItem: ClassItem): string => {
  if (typeof classItem.acadTerm_id === 'object' && classItem.acadTerm_id !== null)
    return classItem.acadTerm_id.status

  const term = academicTerms.value.find(t => t.id === classItem.acadTerm_id)
  return term?.status || ''
}

// Get course display
const getCourse = (classItem: ClassItem): string => {
  if (typeof classItem.course_id === 'object' && classItem.course_id !== null)
    return classItem.course_id.courseCode

  const course = courses.value.find(c => c.id === classItem.course_id)
  return course?.courseCode || '-'
}

// Get course full name for tooltip
const getCourseName = (classItem: ClassItem): string => {
  if (typeof classItem.course_id === 'object' && classItem.course_id !== null)
    return classItem.course_id.courseName

  const course = courses.value.find(c => c.id === classItem.course_id)
  return course?.courseName || ''
}

// Get department display
const getDepartment = (classItem: ClassItem): string => {
  if (!classItem.department_id || !Array.isArray(classItem.department_id) || classItem.department_id.length === 0)
    return ''

  const item = classItem.department_id[0]
  let deptId: number | null = null

  // Handle different Directus relationship structures
  if (typeof item === 'number') {
    deptId = item
  }
  else if (typeof item === 'object' && item !== null) {
    deptId = (item as any).Department_id || (item as any).id || null
  }

  if (deptId) {
    const dept = departments.value.find(d => d.id === deptId)
    if (dept && typeof dept.name === 'object' && dept.name !== null)
      return dept.name.programCode
  }

  return ''
}

// Get student count - handles junction table structure
const getStudentCount = (classItem: ClassItem): number => {
  if (!classItem.student_id || !Array.isArray(classItem.student_id))
    return 0

  // Count valid student entries from junction table
  return classItem.student_id.filter((item: any) => {
    if (typeof item === 'number')
      return true
    if (typeof item === 'object' && item !== null)
      return item.students_id || item.id
    return false
  }).length
}

// Get selected department title for display
const selectedDepartmentTitle = computed(() => {
  if (!form.value.department_id) return ''
  const dept = departmentOptions.value.find(d => d.id === form.value.department_id)
  return dept?.title || ''
})

// Computed for department selection with proper object binding
const selectedDepartment = computed({
  get: () => {
    if (!form.value.department_id) return null
    return departmentOptions.value.find(d => d.id === form.value.department_id) || null
  },
  set: (val) => {
    form.value.department_id = val?.id || null
  },
})

// Get available sections based on selected department
const availableSections = computed(() => {
  const sections: string[] = []

  // Get program code from selected department
  const selectedProgramCode = selectedDepartmentTitle.value

  for (const cs of classSections.value) {
    if (cs.section && Array.isArray(cs.section)) {
      let programCode = ''
      if (typeof cs.program_id === 'object' && cs.program_id !== null)
        programCode = cs.program_id.programCode

      // If department is selected, only show sections for that program
      if (selectedProgramCode && programCode !== selectedProgramCode)
        continue

      for (const sec of cs.section) {
        const fullSection = programCode ? `${programCode}${sec}` : sec
        if (!sections.includes(fullSection))
          sections.push(fullSection)
      }
    }
  }
  return sections.sort()
})

// Get academic terms for dropdown
const academicTermOptions = computed(() => {
  return academicTerms.value.map(term => ({
    id: term.id,
    title: `${term.schoolYear} - ${term.semester}`,
    status: term.status,
  }))
})

// Get departments formatted for dropdown
const departmentOptions = computed(() => {
  return departments.value.map(dept => ({
    id: dept.id,
    title: typeof dept.name === 'object' && dept.name !== null ? dept.name.programCode : '-',
    subtitle: typeof dept.name === 'object' && dept.name !== null ? dept.name.programName : '',
  }))
})

// Get department ID from class item for filtering
const getClassDepartmentId = (classItem: ClassItem): number | null => {
  if (!classItem.department_id || !Array.isArray(classItem.department_id) || classItem.department_id.length === 0)
    return null

  const item = classItem.department_id[0]

  if (typeof item === 'number')
    return item
  if (typeof item === 'object' && item !== null)
    return (item as any).Department_id || (item as any).id || null

  return null
}

// Filtered classes by department
const filteredClasses = computed(() => {
  if (!departmentFilter.value)
    return classes.value

  return classes.value.filter(classItem => getClassDepartmentId(classItem) === departmentFilter.value)
})

// Watch for department changes to reset section
watch(() => form.value.department_id, () => {
  // Clear section when department changes (only if not editing)
  if (!isEditing.value)
    form.value.section = ''
})

// Get courses formatted for dropdown
const courseOptions = computed(() => {
  return courses.value.map(course => ({
    id: course.id,
    title: course.courseCode,
    subtitle: course.courseName,
  }))
})

// Fetch classes from Directus
const fetchClasses = async () => {
  isLoading.value = true
  try {
    const res = await $api('/items/classes', {
      params: {
        fields: ['*', 'acadTerm_id.*', 'course_id.*', 'department_id.*', 'student_id.*'],
      },
    })

    classes.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch classes:', error)
  }
  finally {
    isLoading.value = false
  }
}

// Fetch academic terms
const fetchAcademicTerms = async () => {
  try {
    const res = await $api('/items/academicTerms', {
      params: {
        fields: ['id', 'schoolYear', 'semester', 'status'],
        sort: '-schoolYear',
      },
    })

    academicTerms.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch academic terms:', error)
  }
}

// Fetch courses
const fetchCourses = async () => {
  try {
    const res = await $api('/items/courses', {
      params: {
        fields: ['id', 'courseCode', 'courseName'],
        sort: 'courseCode',
      },
    })

    courses.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch courses:', error)
  }
}

// Fetch class sections
const fetchClassSections = async () => {
  try {
    const res = await $api('/items/ClassSection', {
      params: {
        fields: ['id', 'section', 'program_id.id', 'program_id.programCode'],
      },
    })

    classSections.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch class sections:', error)
  }
}

// Fetch departments
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

// Open dialog for creating new class
const openCreateDialog = () => {
  isEditing.value = false
  form.value = {
    id: undefined,
    acadTerm_id: null,
    course_id: null,
    section: '',
    department_id: null,
  }
  isDialogOpen.value = true
}

// Get department option by ID
const getDepartmentOption = (deptId: number) => {
  return departmentOptions.value.find(d => d.id === deptId) || null
}

// Open dialog for editing class
const openEditDialog = (classItem: ClassItem) => {
  isEditing.value = true

  // Extract IDs from relationships
  const acadTermId = typeof classItem.acadTerm_id === 'object' && classItem.acadTerm_id !== null
    ? classItem.acadTerm_id.id
    : classItem.acadTerm_id

  const courseId = typeof classItem.course_id === 'object' && classItem.course_id !== null
    ? classItem.course_id.id
    : classItem.course_id

  // Get first department ID from junction table (Department_id with capital D)
  let deptId: number | null = null
  if (classItem.department_id && classItem.department_id.length > 0) {
    const firstDept = classItem.department_id[0]
    if (typeof firstDept === 'object' && firstDept !== null) {
      // Junction table structure: { id, classes_id, Department_id }
      deptId = (firstDept as any).Department_id || (firstDept as any).id || null
    }
    else {
      deptId = firstDept as number
    }
  }

  form.value = {
    id: classItem.id,
    acadTerm_id: acadTermId,
    course_id: courseId,
    section: classItem.section,
    department_id: deptId,
  }

  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = (classItem: ClassItem) => {
  selectedClass.value = classItem
  isDeleteDialogOpen.value = true
}

// Save class (create or update)
const saveClass = async () => {
  try {
    const body: any = {
      acadTerm_id: form.value.acadTerm_id,
      course_id: form.value.course_id,
      section: form.value.section,
    }

    // Handle department_id M2M - Directus expects junction table structure
    if (form.value.department_id) {
      body.department_id = [{ Department_id: form.value.department_id }]
    }
    else {
      body.department_id = []
    }

    if (isEditing.value && form.value.id) {
      await $api(`/items/classes/${form.value.id}`, {
        method: 'PATCH',
        body,
      })
    }
    else {
      await $api('/items/classes', {
        method: 'POST',
        body,
      })
    }

    isDialogOpen.value = false
    await fetchClasses()
  }
  catch (error) {
    console.error('Failed to save class:', error)
  }
}

// Delete class
const deleteClass = async () => {
  if (!selectedClass.value?.id)
    return

  try {
    await $api(`/items/classes/${selectedClass.value.id}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedClass.value = null
    await fetchClasses()
  }
  catch (error) {
    console.error('Failed to delete class:', error)
  }
}

// Fetch data on mount
onMounted(() => {
  fetchClasses()
  fetchAcademicTerms()
  fetchCourses()
  fetchClassSections()
  fetchDepartments()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="d-flex align-center pa-6">
        <span class="text-h5">Class List</span>
        <VSpacer />
        <VTextField
          v-model="search"
          prepend-inner-icon="ri-search-line"
          placeholder="Search classes..."
          density="compact"
          variant="outlined"
          hide-details
          class="me-4"
          style="max-width: 300px;"
        />
        <VSelect
          v-model="departmentFilter"
          :items="departmentOptions"
          item-title="title"
          item-value="id"
          label="Department"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          class="me-4"
          style="max-width: 180px;"
        />
        <VBtn
          color="primary"
          prepend-icon="ri-add-line"
          @click="openCreateDialog"
        >
          Add Class
        </VBtn>
      </VCardTitle>

      <VDivider />

      <VDataTable
        :headers="headers"
        :items="filteredClasses"
        :search="search"
        :loading="isLoading"
        hover
      >
        <template #item.section="{ item }">
          <span class="font-weight-medium">{{ item.section }}</span>
        </template>

        <template #item.course="{ item }">
          <VTooltip location="top">
            <template #activator="{ props }">
              <span v-bind="props" class="font-weight-medium text-primary" style="cursor: help;">
                {{ getCourse(item) }}
              </span>
            </template>
            {{ getCourseName(item) }}
          </VTooltip>
        </template>

        <template #item.department="{ item }">
          <span v-if="getDepartment(item)">{{ getDepartment(item) }}</span>
          <span v-else class="text-medium-emphasis">-</span>
        </template>

        <template #item.acadTerm="{ item }">
          <div class="d-flex align-center gap-2">
            <span>{{ getAcademicTerm(item) }}</span>
            <VChip
              v-if="getAcademicTermStatus(item)"
              :color="getAcademicTermStatus(item) === 'Active' ? 'success' : getAcademicTermStatus(item) === 'Draft' ? 'warning' : 'secondary'"
              size="x-small"
              variant="tonal"
            >
              {{ getAcademicTermStatus(item) }}
            </VChip>
          </div>
        </template>

        <template #item.studentCount="{ item }">
          <span :class="getStudentCount(item) > 0 ? 'font-weight-medium' : 'text-medium-emphasis'">
            {{ getStudentCount(item) }}
          </span>
        </template>

        <template #item.actions="{ item }">
          <div class="d-flex justify-center gap-1">
            <IconBtn
              size="small"
              @click="openEditDialog(item)"
            >
              <VIcon icon="ri-pencil-line" />
            </IconBtn>
            <IconBtn
              size="small"
              color="error"
              @click="openDeleteDialog(item)"
            >
              <VIcon icon="ri-delete-bin-line" />
            </IconBtn>
          </div>
        </template>

        <template #no-data>
          <div class="text-center pa-4">
            <p class="text-body-1 text-medium-emphasis">No classes found</p>
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Create/Edit Dialog -->
    <VDialog
      v-model="isDialogOpen"
      max-width="600"
      persistent
    >
      <VCard>
        <VCardTitle class="pa-6">
          {{ isEditing ? 'Edit Class' : 'Add New Class' }}
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12">
              <VSelect
                v-model="selectedDepartment"
                label="Department"
                :items="departmentOptions"
                item-title="title"
                item-value="id"
                return-object
                variant="outlined"
                placeholder="Select department..."
                hint="Select department first to filter sections"
                persistent-hint
                :rules="[v => !!v || 'Department is required']"
              >
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.title }}
                    </template>
                    <template #subtitle>
                      {{ item.raw.subtitle }}
                    </template>
                  </VListItem>
                </template>
              </VSelect>
            </VCol>
            <VCol cols="12" md="6">
              <VAutocomplete
                v-model="form.section"
                label="Section"
                :items="availableSections"
                variant="outlined"
                placeholder="Type to search sections..."
                :rules="[v => !!v || 'Section is required']"
                :disabled="!form.department_id"
                :hint="!form.department_id ? 'Select a department first' : ''"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="6">
              <VAutocomplete
                v-model="form.acadTerm_id"
                label="Academic Term"
                :items="academicTermOptions"
                item-title="title"
                item-value="id"
                variant="outlined"
                placeholder="Select academic term..."
                :rules="[v => !!v || 'Academic term is required']"
              >
                <template #selection="{ item }">
                  {{ item.raw?.title || '' }}
                </template>
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.title }}
                    </template>
                    <template #append>
                      <VChip
                        :color="item.raw.status === 'Active' ? 'success' : item.raw.status === 'Draft' ? 'warning' : 'secondary'"
                        size="x-small"
                      >
                        {{ item.raw.status }}
                      </VChip>
                    </template>
                  </VListItem>
                </template>
              </VAutocomplete>
            </VCol>
            <VCol cols="12">
              <VAutocomplete
                v-model="form.course_id"
                label="Course"
                :items="courseOptions"
                item-title="title"
                item-value="id"
                variant="outlined"
                placeholder="Type to search courses..."
                :rules="[v => !!v || 'Course is required']"
              >
                <template #selection="{ item }">
                  {{ item.raw?.title || '' }}
                </template>
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.title }}
                    </template>
                    <template #subtitle>
                      {{ item.raw.subtitle }}
                    </template>
                  </VListItem>
                </template>
              </VAutocomplete>
            </VCol>
          </VRow>
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isDialogOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="primary"
            :disabled="!form.department_id || !form.section || !form.acadTerm_id || !form.course_id"
            @click="saveClass"
          >
            {{ isEditing ? 'Update' : 'Create' }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Delete Confirmation Dialog -->
    <VDialog
      v-model="isDeleteDialogOpen"
      max-width="400"
    >
      <VCard>
        <VCardTitle class="pa-6">
          Delete Class
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          Are you sure you want to delete the class <strong>{{ selectedClass?.section }}</strong>
          <template v-if="selectedClass">
            ({{ getCourse(selectedClass) }})
          </template>?
          This action cannot be undone.
        </VCardText>

        <VDivider />

        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn
            variant="outlined"
            @click="isDeleteDialogOpen = false"
          >
            Cancel
          </VBtn>
          <VBtn
            color="error"
            @click="deleteClass"
          >
            Delete
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

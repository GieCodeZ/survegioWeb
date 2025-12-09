<script setup lang="ts">
import { $api } from '@/utils/api'

definePage({
  meta: {
    action: 'read',
    subject: 'classSection',
  },
})

interface Program {
  id: number
  programCode: string
  programName: string
}

interface ClassSection {
  id?: number
  section: string[]
  program_id: number | { id: number; programCode: string } | null
}

// State
const classSections = ref<ClassSection[]>([])
const programs = ref<Program[]>([])
const isLoading = ref(false)
const isDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const isEditing = ref(false)
const selectedClassSection = ref<ClassSection | null>(null)

const form = ref<ClassSection>({
  section: [],
  program_id: null,
})

const search = ref('')

// Default section options
const defaultSectionOptions = ['1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B']
const sectionOptions = ref([...defaultSectionOptions])

// Table headers
const headers = [
  { title: 'Program', key: 'program', sortable: true },
  { title: 'Sections', key: 'section', sortable: false },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

// Get program code from class section
const getProgramCode = (classSection: ClassSection) => {
  if (typeof classSection.program_id === 'object' && classSection.program_id !== null)
    return classSection.program_id.programCode

  const program = programs.value.find(p => p.id === classSection.program_id)

  return program?.programCode || '-'
}

// Fetch class sections from Directus
const fetchClassSections = async () => {
  isLoading.value = true
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
  finally {
    isLoading.value = false
  }
}

// Fetch programs for dropdown
const fetchPrograms = async () => {
  try {
    const res = await $api('/items/programs', {
      params: {
        fields: ['id', 'programCode', 'programName'],
        sort: 'programCode',
      },
    })

    programs.value = res.data || []
  }
  catch (error) {
    console.error('Failed to fetch programs:', error)
  }
}

// Open dialog for creating new class section
const openCreateDialog = () => {
  isEditing.value = false
  form.value = { section: [], program_id: null }
  sectionOptions.value = [...defaultSectionOptions]
  isDialogOpen.value = true
}

// Open dialog for editing class section
const openEditDialog = (classSection: ClassSection) => {
  isEditing.value = true

  // Extract program_id as number
  const programId = typeof classSection.program_id === 'object' && classSection.program_id !== null
    ? classSection.program_id.id
    : classSection.program_id

  form.value = {
    id: classSection.id,
    section: [...classSection.section],
    program_id: programId,
  }

  // Add any existing sections that aren't in default options
  const allSections = new Set([...defaultSectionOptions, ...classSection.section])

  sectionOptions.value = [...allSections]
  isDialogOpen.value = true
}

// Open delete confirmation dialog
const openDeleteDialog = (classSection: ClassSection) => {
  selectedClassSection.value = classSection
  isDeleteDialogOpen.value = true
}

// Save class section (create or update)
const saveClassSection = async () => {
  try {
    if (isEditing.value && form.value.id) {
      // Update existing class section
      await $api(`/items/ClassSection/${form.value.id}`, {
        method: 'PATCH',
        body: {
          section: form.value.section,
          program_id: form.value.program_id,
        },
      })
    }
    else {
      // Create new class section
      await $api('/items/ClassSection', {
        method: 'POST',
        body: {
          section: form.value.section,
          program_id: form.value.program_id,
        },
      })
    }

    isDialogOpen.value = false
    await fetchClassSections()
  }
  catch (error) {
    console.error('Failed to save class section:', error)
  }
}

// Delete class section
const deleteClassSection = async () => {
  if (!selectedClassSection.value?.id)
    return

  try {
    await $api(`/items/ClassSection/${selectedClassSection.value.id}`, {
      method: 'DELETE',
    })

    isDeleteDialogOpen.value = false
    selectedClassSection.value = null
    await fetchClassSections()
  }
  catch (error) {
    console.error('Failed to delete class section:', error)
  }
}

// Fetch data on mount
onMounted(() => {
  fetchClassSections()
  fetchPrograms()
})
</script>

<template>
  <div>
    <VCard>
      <VCardTitle class="d-flex align-center pa-6">
        <span class="text-h5">Class Sections</span>
        <VSpacer />
        <VTextField
          v-model="search"
          prepend-inner-icon="ri-search-line"
          placeholder="Search class sections..."
          density="compact"
          variant="outlined"
          hide-details
          class="me-4"
          style="max-width: 300px;"
        />
        <VBtn
          color="primary"
          prepend-icon="ri-add-line"
          @click="openCreateDialog"
        >
          Add Class Section
        </VBtn>
      </VCardTitle>

      <VDivider />

      <VDataTable
        :headers="headers"
        :items="classSections"
        :search="search"
        :loading="isLoading"
        hover
      >
        <template #item.program="{ item }">
          <VChip
            color="primary"
            variant="tonal"
            size="small"
          >
            {{ getProgramCode(item) }}
          </VChip>
        </template>

        <template #item.section="{ item }">
          <div class="d-flex flex-wrap gap-1">
            <VChip
              v-for="sec in item.section"
              :key="sec"
              size="small"
              variant="outlined"
            >
              {{ sec }}
            </VChip>
          </div>
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
            <p class="text-body-1 text-medium-emphasis">No class sections found</p>
          </div>
        </template>
      </VDataTable>
    </VCard>

    <!-- Create/Edit Dialog -->
    <VDialog
      v-model="isDialogOpen"
      max-width="500"
      persistent
    >
      <VCard>
        <VCardTitle class="pa-6">
          {{ isEditing ? 'Edit Class Section' : 'Add New Class Section' }}
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          <VRow>
            <VCol cols="12">
              <VSelect
                v-model="form.program_id"
                label="Program"
                :items="programs"
                item-title="programCode"
                item-value="id"
                variant="outlined"
                :rules="[v => !!v || 'Program is required']"
              >
                <template #item="{ item, props }">
                  <VListItem v-bind="props">
                    <template #title>
                      {{ item.raw.programCode }}
                    </template>
                    <template #subtitle>
                      {{ item.raw.programName }}
                    </template>
                  </VListItem>
                </template>
              </VSelect>
            </VCol>
            <VCol cols="12">
              <VCombobox
                v-model="form.section"
                label="Sections"
                :items="sectionOptions"
                variant="outlined"
                multiple
                chips
                closable-chips
                hint="Select from list or type a new section and press Enter to add"
                persistent-hint
              >
                <template #no-data>
                  <VListItem>
                    <VListItemTitle>
                      Type a section name and press <kbd>Enter</kbd> to add
                    </VListItemTitle>
                  </VListItem>
                </template>
              </VCombobox>
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
            :disabled="!form.program_id || form.section.length === 0"
            @click="saveClassSection"
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
          Delete Class Section
        </VCardTitle>

        <VDivider />

        <VCardText class="pa-6">
          Are you sure you want to delete the class sections for <strong>{{ getProgramCode(selectedClassSection!) }}</strong>?
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
            @click="deleteClassSection"
          >
            Delete
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

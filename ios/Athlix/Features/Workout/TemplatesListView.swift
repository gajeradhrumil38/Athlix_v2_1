import SwiftUI
import AthlixCore

/// Standalone CRUD list for the user's saved templates/plans, mirroring
/// web's `Templates.tsx`. Distinct from `ExercisePickerView`'s My Plans tab
/// (which is read-mostly: start/delete/edit-via-sheet inline within the
/// picker) -- this is the dedicated full screen for managing plans, reached
/// independently of an active logging session.
struct TemplatesListView: View {
    let userId: String
    let exerciseLibraryRepository: ExerciseLibraryRepository
    let templateRepository: TemplateRepository

    @State private var templates: [Template] = []
    @State private var isLoading = false
    /// Local, cleared-at-the-start-of-every-load error slot -- matching the
    /// fix already applied to `ExercisePickerView`'s per-tab error state
    /// (each async path gets its own slot, cleared before its own `await`)
    /// rather than a single shared property that could linger stale.
    @State private var errorMessage: String?

    @State private var showingNewPlan = false
    @State private var editingTemplate: Template?
    @State private var templatePendingDelete: Template?

    var body: some View {
        NavigationStack {
            content
                .background(ColorTokens.bgBase)
                .navigationTitle("Templates")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            showingNewPlan = true
                        } label: {
                            Image(systemName: "plus")
                        }
                    }
                }
                .task { await loadTemplates() }
                .sheet(isPresented: $showingNewPlan, onDismiss: { Task { await loadTemplates() } }) {
                    PlanEditorView(userId: userId, exerciseLibraryRepository: exerciseLibraryRepository, templateRepository: templateRepository)
                }
                .sheet(item: $editingTemplate, onDismiss: { Task { await loadTemplates() } }) { template in
                    PlanEditorView(userId: userId, exerciseLibraryRepository: exerciseLibraryRepository, templateRepository: templateRepository, existing: template)
                }
                .confirmationDialog(
                    "Delete \(templatePendingDelete?.title ?? "this template")?",
                    isPresented: Binding(
                        get: { templatePendingDelete != nil },
                        set: { if !$0 { templatePendingDelete = nil } }
                    ),
                    titleVisibility: .visible
                ) {
                    Button("Delete", role: .destructive) {
                        if let template = templatePendingDelete {
                            deleteTemplate(template)
                        }
                    }
                    Button("Cancel", role: .cancel) {}
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading {
            ProgressView().tint(ColorTokens.accent).frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let errorMessage {
            emptyState(text: errorMessage, isError: true)
        } else if templates.isEmpty {
            emptyState(text: "No saved templates yet. Tap + to create one.")
        } else {
            List {
                ForEach(templates) { template in
                    templateRow(template)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
    }

    private func templateRow(_ template: Template) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(template.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ColorTokens.textPrimary)
                Text("\(template.exercises.count) exercises")
                    .font(.caption)
                    .foregroundStyle(ColorTokens.textSecondary)
            }
            Spacer()
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture {
            editingTemplate = template
        }
        .listRowBackground(ColorTokens.bgBase)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                templatePendingDelete = template
            } label: {
                Label("Delete", systemImage: "trash")
            }

            Button {
                editingTemplate = template
            } label: {
                Label("Edit", systemImage: "pencil")
            }
            .tint(ColorTokens.accent)
        }
    }

    private func emptyState(text: String, isError: Bool = false) -> some View {
        VStack {
            Spacer()
            Text(text)
                .font(.subheadline)
                .foregroundStyle(isError ? ColorTokens.red : ColorTokens.textMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private func loadTemplates() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            templates = try await templateRepository.fetchTemplates(userId: userId)
        } catch {
            errorMessage = "Couldn't load templates."
        }
    }

    private func deleteTemplate(_ template: Template) {
        templates.removeAll { $0.id == template.id }
        Task {
            do {
                try await templateRepository.deleteTemplate(userId: userId, templateId: template.id)
            } catch {
                // Reload FIRST, then set the delete-failure message -- loadTemplates()
                // clears `errorMessage` at its own start (before its await), so
                // setting the message before reloading would have it wiped out
                // before the user ever saw it. Mirrors ExercisePickerView's
                // deleteTemplate ordering exactly.
                await loadTemplates()
                errorMessage = "Couldn't delete \(template.title)."
            }
        }
    }
}

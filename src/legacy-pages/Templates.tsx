import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { Plus, Trash2, Save, Edit2, X } from 'lucide-react';
import { ExercisePicker } from '../components/log/ExercisePicker';
import { ExerciseImage } from '../components/shared/ExerciseImage';
import { deleteTemplate, getTemplates, saveTemplate } from '../lib/supabaseData';

interface TemplateExercise {
  id: string;
  name: string;
  muscle_group?: string;
  default_sets: number;
  default_reps: number;
  default_weight: number;
  exercise_db_id?: string;
}

interface Template {
  id: string;
  title: string;
  template_exercises: TemplateExercise[];
}

export const Templates: React.FC = () => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
  const [showExercisePicker, setShowExercisePicker] = useState(false);

  const [title, setTitle] = useState('');
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);

  useEffect(() => {
    fetchTemplates();
  }, [user]);

  const fetchTemplates = async () => {
    if (!user) {
      setTemplates([]);
      setLoading(false);
      return;
    }

    try {
      const data = await getTemplates(user.id);
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setExercises([]);
    setIsCreating(false);
    setEditTemplateId(null);
  };

  const handleEdit = (template: Template) => {
    setTitle(template.title);
    // Preserve original IDs so the server can do in-place updates
    setExercises(template.template_exercises.map(te => ({ ...te })));
    setEditTemplateId(template.id);
    setIsCreating(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    
    try {
      if (!user) throw new Error('Sign in to delete templates');
      await deleteTemplate(user.id, id);
      toast.success('Template deleted');
      fetchTemplates();
    } catch (error: any) {
      toast.error('Failed to delete template');
    }
  };

  const handleSave = async () => {
    if (!user) {
      toast.error('Sign in to save templates');
      return;
    }

    if (!title) {
      toast.error('Please enter a template title');
      return;
    }
    if (exercises.length === 0) {
      toast.error('Please add at least one exercise');
      return;
    }
    if (exercises.some(ex => !ex.name)) {
      toast.error('Please fill in all exercise names');
      return;
    }

    setLoading(true);
    try {
      await saveTemplate(user.id, {
        templateId: editTemplateId,
        title,
        exercises: exercises.map((ex, index) => ({
          name: ex.name,
          muscle_group: ex.muscle_group || null,
          default_sets: Number(ex.default_sets),
          default_reps: Number(ex.default_reps),
          default_weight: Number(ex.default_weight),
          exercise_db_id: ex.exercise_db_id || null,
          order_index: index,
        })),
      });

      toast.success(editTemplateId ? 'Template updated!' : 'Template created!');
      resetForm();
      fetchTemplates();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  const addExercise = () => {
    setShowExercisePicker(true);
  };

  const handleExerciseSelect = (exercise: any) => {
    setExercises([
      ...exercises,
      {
        id: crypto.randomUUID(),
        name: exercise.name,
        muscle_group: exercise.muscleGroup,
        default_sets: 3,
        default_reps: 10,
        default_weight: 0,
        exercise_db_id: exercise.exercise_db_id
      }
    ]);
    setShowExercisePicker(false);
  };

  const updateExercise = (id: string, field: keyof TemplateExercise, value: any) => {
    setExercises(exercises.map(ex => ex.id === id ? { ...ex, [field]: value } : ex));
  };

  const removeExercise = (id: string) => {
    setExercises(exercises.filter(ex => ex.id !== id));
  };

  if (loading && !isCreating) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <div className="skeleton h-10 rounded-xl w-1/3" />
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-8 max-w-3xl mx-auto">
      <header className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Templates</h1>
        {!isCreating && (
          <button 
            onClick={() => setIsCreating(true)}
            className="flex items-center space-x-2 bg-[var(--accent)] text-black px-4 py-2 rounded-xl font-medium hover:bg-[var(--accent)]/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Template</span>
          </button>
        )}
      </header>

      {isCreating ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex justify-between items-center bg-[var(--bg-surface)] p-4 rounded-2xl border border-[var(--border)]">
            <input 
              type="text" 
              placeholder="Template Title (e.g. Push Day)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-transparent border-none text-xl font-bold text-white focus:outline-none focus:ring-0 w-full"
            />
            <button onClick={resetForm} className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">Default Exercises</h2>
              <button 
                onClick={addExercise}
                className="text-sm text-[var(--accent)] flex items-center space-x-1 hover:underline"
              >
                <Plus className="w-4 h-4" />
                <span>Add Exercise</span>
              </button>
            </div>

            {exercises.map((exercise, index) => (
              <div key={exercise.id} className="bg-[var(--bg-surface)] p-4 rounded-2xl border border-[var(--border)] relative">
                <button 
                  onClick={() => removeExercise(exercise.id)}
                  className="absolute top-4 right-4 text-[var(--text-secondary)] hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                
                <div className="mb-4 pr-8 flex items-center gap-3">
                  {exercise.exercise_db_id && (
                    <ExerciseImage 
                      exerciseId={exercise.exercise_db_id} 
                      exerciseName={exercise.name} 
                      size="sm" 
                    />
                  )}
                  <input 
                    type="text" 
                    placeholder="Exercise name"
                    value={exercise.name}
                    onChange={(e) => updateExercise(exercise.id, 'name', e.target.value)}
                    className="w-full bg-transparent border-b border-[var(--border)] px-0 py-2 text-white focus:outline-none focus:border-[var(--accent)] text-lg font-medium"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 text-center">Sets</label>
                    <input 
                      type="number" 
                      value={exercise.default_sets}
                      onChange={(e) => updateExercise(exercise.id, 'default_sets', parseInt(e.target.value))}
                      className="w-full bg-black border border-[var(--border)] rounded-xl px-2 py-2 text-white text-center focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 text-center">Reps</label>
                    <input 
                      type="number" 
                      value={exercise.default_reps}
                      onChange={(e) => updateExercise(exercise.id, 'default_reps', parseInt(e.target.value))}
                      className="w-full bg-black border border-[var(--border)] rounded-xl px-2 py-2 text-white text-center focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 text-center">Weight</label>
                    <input 
                      type="number" 
                      value={exercise.default_weight}
                      onChange={(e) => updateExercise(exercise.id, 'default_weight', parseFloat(e.target.value))}
                      className="w-full bg-black border border-[var(--border)] rounded-xl px-2 py-2 text-white text-center focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button 
            onClick={handleSave}
            disabled={loading}
            className="w-full flex justify-center items-center space-x-2 py-3 px-4 rounded-xl shadow-sm text-sm font-medium text-black bg-[var(--accent)] hover:bg-[var(--accent)]/90 focus:outline-none disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>{loading ? 'Saving...' : 'Save Template'}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.length > 0 ? (
            templates.map((template) => (
              <div key={template.id} className="bg-[var(--bg-surface)] p-5 rounded-2xl border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{template.title}</h3>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    {template.template_exercises?.length || 0} exercises
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {template.template_exercises?.slice(0, 3).map((ex: any) => (
                      <span key={ex.id} className="px-2 py-1 bg-[var(--bg-surface)] rounded-md text-[10px] text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1">
                        {ex.exercise_db_id && (
                          <ExerciseImage 
                            exerciseId={ex.exercise_db_id} 
                            exerciseName={ex.name} 
                            size="sm" 
                          />
                        )}
                        {ex.name}
                      </span>
                    ))}
                    {(template.template_exercises?.length || 0) > 3 && (
                      <span className="px-2 py-1 bg-[var(--bg-surface)] rounded-md text-[10px] text-[var(--text-secondary)]">
                        +{(template.template_exercises?.length || 0) - 3} more
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex space-x-2 sm:self-start">
                  <button 
                    onClick={() => handleEdit(template)}
                    className="p-2 bg-[var(--bg-surface)] text-[var(--text-secondary)] rounded-xl hover:bg-white/10 hover:text-[var(--text-primary)] transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(template.id)}
                    className="p-2 bg-[var(--bg-surface)] text-[var(--text-secondary)] rounded-xl hover:bg-red-500/20 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-[var(--bg-surface)] p-8 rounded-2xl border border-[var(--border)] text-center">
              <p className="text-[var(--text-secondary)] text-sm">No templates yet. Create one to speed up your logging!</p>
            </div>
          )}
        </div>
      )}

      {showExercisePicker && (
        <ExercisePicker
          onSelect={handleExerciseSelect}
          onClose={() => setShowExercisePicker(false)}
        />
      )}
    </div>
  );
};

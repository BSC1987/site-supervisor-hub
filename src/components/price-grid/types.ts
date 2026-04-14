export type TaskType = 'internal' | 'garage' | 'external' | 'variation';

export interface Plot {
  id: string;
  plot_name: string;
  house_type: string | null;
  status: string;
  sort_order: number;
  is_archived: boolean;
}

export interface ArchivedPlotEntry {
  id: string;
  plot_name: string;
  sections: TaskType[];
}

export interface Template {
  id: string;
  name: string;
  type: 'internal' | 'garage' | 'external';
  sort_order: number;
}

export interface PlotTaskRow {
  id: string;
  plot_id: string;
  task_template_id: string | null;
  name: string;
  type: TaskType;
  sort_order: number;
  price: number | null;
  archived: boolean;
}

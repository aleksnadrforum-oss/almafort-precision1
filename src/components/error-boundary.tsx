import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

type Props = {
  /** Название модуля для сообщения пользователю. */
  title: string;
  hint?: string;
  children: ReactNode;
};

type State = { failed: boolean };

/**
 * Предохранитель тяжёлых модулей (ИИ-камера, конфигуратор, карта).
 * Падение одного блока не должно ронять шапку, каталог и корзину.
 */
export class ModuleErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[module:${this.props.title}]`, error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p>
          {this.props.title} временно недоступен.{" "}
          {this.props.hint ?? "Воспользуйтесь обычным поиском по каталогу — остальные разделы работают."}
        </p>
      </div>
    );
  }
}

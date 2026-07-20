import SwiftUI
import AthlixCore

/// Content of the "Weekly Goal" edit sheet, mirroring web's
/// `GoalEditSheet.tsx`. Presented via SwiftUI's native `.sheet(isPresented:)`
/// -- there's no need to hand-build the backdrop/slide-up animation web does
/// manually with framer-motion, since the native sheet already provides its
/// own backdrop and drag-to-dismiss behavior.
struct GoalEditSheetView: View {
    let onConfirm: (Int) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var selected: Int

    init(current: Int, onConfirm: @escaping (Int) -> Void) {
        self.onConfirm = onConfirm
        self._selected = State(initialValue: current)
    }

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("DAYS PER WEEK")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(1.5)
                        .foregroundStyle(ColorTokens.textSecondary)
                        .padding(.bottom, 4)

                    Text("How many training days do you want to hit each week?")
                        .font(.system(size: 12))
                        .foregroundStyle(ColorTokens.textMuted)
                        .padding(.bottom, 16)

                    LazyVGrid(columns: columns, spacing: 6) {
                        ForEach(1...7, id: \.self) { day in
                            dayCell(day)
                        }
                    }

                    contextHint
                        .padding(.top, 16)
                }
                .padding(20)
            }
            confirmButton
        }
        .background(ColorTokens.bgSurface)
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("Weekly Goal")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(ColorTokens.textPrimary)
            Spacer()
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(ColorTokens.textSecondary)
                    .frame(width: 32, height: 32)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(ColorTokens.border, lineWidth: 1)
                    )
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 4)
        .padding(.bottom, 12)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(ColorTokens.border)
                .frame(height: 1)
        }
    }

    // MARK: - Day cell

    private func dayCell(_ day: Int) -> some View {
        let isActive = selected == day
        return Button {
            selected = day
        } label: {
            VStack(spacing: 4) {
                Text("\(day)")
                    .font(.system(size: 20, weight: .black))
                    .foregroundStyle(isActive ? Color.black : ColorTokens.textPrimary)
                Text(day == 1 ? "DAY" : "DAYS")
                    .font(.system(size: 8, weight: .bold))
                    .tracking(0.5)
                    .foregroundStyle(isActive ? Color.black : ColorTokens.textMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(isActive ? ColorTokens.accent : ColorTokens.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isActive ? ColorTokens.accent : ColorTokens.border, lineWidth: 1)
            )
            .shadow(color: isActive ? ColorTokens.accentGlow : .clear, radius: 7)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Context hint

    private var hintText: String {
        if selected <= 3 {
            return "Great for recovery-focused training"
        } else if selected <= 5 {
            return "Balanced training frequency"
        } else {
            return "High-intensity schedule — prioritise recovery"
        }
    }

    private var contextHint: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(ColorTokens.accent)
                .frame(width: 6, height: 6)
            Text(hintText)
                .font(.system(size: 11))
                .foregroundStyle(ColorTokens.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(ColorTokens.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(ColorTokens.border, lineWidth: 1)
        )
    }

    // MARK: - Confirm

    private var confirmButton: some View {
        Button {
            onConfirm(selected)
            dismiss()
        } label: {
            Text("SET GOAL")
                .font(.system(size: 14, weight: .bold))
                .tracking(1)
                .foregroundStyle(Color.black)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(ColorTokens.accent)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(ColorTokens.border)
                .frame(height: 1)
        }
    }
}

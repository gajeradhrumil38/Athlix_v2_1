import SwiftUI
import AthlixCore

struct TodayWorkoutView: View {
    let todaysWorkout: Workout?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Today's Workout")
                .font(.caption.weight(.semibold))
                .foregroundStyle(ColorTokens.textSecondary)

            if let workout = todaysWorkout {
                Text(workout.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ColorTokens.textPrimary)
                if let minutes = workout.durationMinutes {
                    Text("\(minutes) min")
                        .font(.footnote)
                        .foregroundStyle(ColorTokens.textSecondary)
                }
            } else {
                Text("No workout logged today.")
                    .font(.footnote)
                    .foregroundStyle(ColorTokens.textSecondary)

                // Disabled placeholder -- the Workout Logger milestone will
                // wire this to actually start a session.
                Button("Start Workout") {}
                    .buttonStyle(.borderedProminent)
                    .tint(ColorTokens.accent)
                    .disabled(true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(ColorTokens.bgSurface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

import random
import os
import sys
import time

# Constants for the game
GRID_SIZE = 5
SNAKE_CHAR = 'S'
FOOD_CHAR = 'F'
EMPTY_CHAR = '.'

# Directions
UP = (-1, 0)
DOWN = (1, 0)
LEFT = (0, -1)
RIGHT = (0, 1)

# Initialize the game state
grid = [[EMPTY_CHAR for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]
snake = [(2, 2)]  # Start with the snake in the middle of the grid
direction = RIGHT
food = None


def place_food():
    """Place food on the grid at a random empty location."""
    global food
    empty_cells = [(r, c) for r in range(GRID_SIZE) for c in range(GRID_SIZE) if grid[r][c] == EMPTY_CHAR]
    food = random.choice(empty_cells)
    grid[food[0]][food[1]] = FOOD_CHAR


def print_grid():
    """Print the current state of the grid."""
    os.system('cls' if os.name == 'nt' else 'clear')
    for row in grid:
        print(' '.join(row))
    print(f"Score: {len(snake) - 1}")


def move_snake():
    """Move the snake in the current direction."""
    global snake, food
    head = snake[0]
    new_head = (head[0] + direction[0], head[1] + direction[1])

    # Check for collisions with walls
    if not (0 <= new_head[0] < GRID_SIZE and 0 <= new_head[1] < GRID_SIZE):
        print("Game Over! You hit the wall.")
        sys.exit()

    # Check for collisions with itself
    if new_head in snake:
        print("Game Over! You ran into yourself.")
        sys.exit()

    # Move the snake
    snake.insert(0, new_head)

    # Check if food is eaten
    if new_head == food:
        place_food()
    else:
        tail = snake.pop()
        grid[tail[0]][tail[1]] = EMPTY_CHAR

    # Update the grid
    grid[new_head[0]][new_head[1]] = SNAKE_CHAR


def change_direction(new_direction):
    """Change the direction of the snake if it's not directly opposite."""
    global direction
    if (direction[0] + new_direction[0], direction[1] + new_direction[1]) != (0, 0):
        direction = new_direction


def main():
    """Main game loop."""
    place_food()
    while True:
        print_grid()
        move_snake()
        time.sleep(0.5)  # Control the speed of the game


if __name__ == "__main__":
    main()

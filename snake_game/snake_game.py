import random
import os
import sys
import tty
import termios

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

class SnakeGame:
    def __init__(self):
        self.grid = [[EMPTY_CHAR for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]
        self.snake = [(2, 2)]  # Start in the middle
        self.direction = random.choice([UP, DOWN, LEFT, RIGHT])
        self.place_food()
        self.update_grid()

    def place_food(self):
        while True:
            x, y = random.randint(0, GRID_SIZE - 1), random.randint(0, GRID_SIZE - 1)
            if (x, y) not in self.snake:
                self.grid[x][y] = FOOD_CHAR
                break

    def update_grid(self):
        for x in range(GRID_SIZE):
            for y in range(GRID_SIZE):
                if (x, y) in self.snake:
                    self.grid[x][y] = SNAKE_CHAR
                elif self.grid[x][y] != FOOD_CHAR:
                    self.grid[x][y] = EMPTY_CHAR

    def print_grid(self):
        os.system('clear' if os.name == 'posix' else 'cls')
        for row in self.grid:
            print(' '.join(row))
        print("\nUse WASD keys to move the snake.")

    def move_snake(self):
        head_x, head_y = self.snake[0]
        delta_x, delta_y = self.direction
        new_head = (head_x + delta_x, head_y + delta_y)

        if (0 <= new_head[0] < GRID_SIZE and 0 <= new_head[1] < GRID_SIZE and new_head not in self.snake):
            self.snake.insert(0, new_head)
            if self.grid[new_head[0]][new_head[1]] == FOOD_CHAR:
                self.place_food()
            else:
                self.snake.pop()
            self.update_grid()
            return True
        return False

    def change_direction(self, new_direction):
        opposite_direction = (-self.direction[0], -self.direction[1])
        if new_direction != opposite_direction:
            self.direction = new_direction

    def get_input(self):
        fd = sys.stdin.fileno()
        old_settings = termios.tcgetattr(fd)
        try:
            tty.setraw(sys.stdin.fileno())
            ch = sys.stdin.read(1)
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        return ch

    def play(self):
        while True:
            self.print_grid()
            move = self.get_input()
            if move == 'w':
                self.change_direction(UP)
            elif move == 's':
                self.change_direction(DOWN)
            elif move == 'a':
                self.change_direction(LEFT)
            elif move == 'd':
                self.change_direction(RIGHT)

            if not self.move_snake():
                print("Game Over!")
                break

if __name__ == "__main__":
    game = SnakeGame()
    game.play()

#pragma once
#include <cstddef>
#include <string>
#include <vector>

namespace zuma {
struct Point { double x = 0, y = 0; };
struct MapGeometry {
    std::string id, title;
    double width = 0, height = 0, diameter = 68, pitch = 102, safetyMargin = 68;
    Point launcher;
    std::vector<Point> path;
    std::vector<double> distances;
    Point at(double distance) const;
    Point slot(std::size_t index) const;
    Point tangent(std::size_t index) const;
};
struct AimResult {
    std::string kind = "spit";
    std::size_t position = 0, targetIndex = 0;
    Point direction, impact, destination;
};
MapGeometry makeMap(const std::string& id, std::size_t capacity);
AimResult resolveAim(const MapGeometry& map, std::size_t count, Point direction);
}
